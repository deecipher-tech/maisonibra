/**
 * Maison Central API Client
 *
 * Responsibilities:
 * - Centralized API URL configuration
 * - JSON and FormData requests
 * - CSRF token handling
 * - Session-based authentication support
 * - Consistent error handling
 *
 * IMPORTANT:
 * Set window.MAISON_API_BASE before loading this file
 * when the frontend and backend use different URLs.
 */

(function () {
  'use strict';

  // Prevent accidental duplicate initialization.
  if (window.MaisonApi) {
    return;
  }

  /**
   * API CONFIGURATION
   *
   * Production example:
   * https://api.yourdomain.com
   *
   * Or, if your API is served from this path:
   * https://alimanschoolkeffi.com/DeeCommerce/backend/public
   *
   * The base URL must match your actual server routing.
   */
  const PRODUCTION_API_BASE = '';

  /**
   * Automatically determine the local backend URL.
   * Supports public pages in the project root and admin/ directory.
   */
  function getLocalBackendUrl() {
    const path = window.location.pathname.replace(/\\/g, '/');

    const adminIndex = path.indexOf('/admin/');

    const rootPath = adminIndex !== -1
      ? path.slice(0, adminIndex)
      : path.replace(/\/[^/]*$/, '');

    return `${window.location.origin}${rootPath}/backend/public`;
  }

  /**
   * Determine the API base URL.
   *
   * Priority:
   * 1. Explicit window.MAISON_API_BASE
   * 2. Production API URL configured below
   * 3. Existing localStorage override
   * 4. Automatically detected local backend
   */
  function getApiBaseUrl() {
    const configured =
      window.MAISON_API_BASE ||
      PRODUCTION_API_BASE ||
      localStorage.getItem('maison_api_base') ||
      getLocalBackendUrl();

    let normalized = String(configured).trim().replace(/\/+$/, '');

    // Be forgiving about how the address was typed (XAMPP paths often miss the scheme or contain spaces).
    if (normalized.startsWith('//')) {
      normalized = `${window.location.protocol}${normalized}`;
    } else if (normalized.startsWith('/')) {
      normalized = `${window.location.origin}${normalized}`;
    } else if (normalized && !/^[a-z][a-z\d+.-]*:\/\//i.test(normalized)) {
      normalized = `http://${normalized}`;
    }

    try {
      normalized = encodeURI(decodeURI(normalized));
    } catch {
      // Leave as typed; the URL check below reports a clear error.
    }

    if (!normalized) {
      throw new Error('Maison API base URL is not configured.');
    }

    // Require a valid absolute HTTP(S) URL.
    let parsed;

    try {
      parsed = new URL(normalized);
    } catch {
      throw new Error(`Maison API base URL must be a valid absolute URL (got "${configured}").`);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Maison API base URL must use HTTP or HTTPS (got "${configured}"). Open the site through XAMPP, e.g. http://localhost/MAISON%20IBRA/index.html, not as a file.`);
    }

    // Do not allow insecure HTTP APIs from an HTTPS page.
    if (
      window.location.protocol === 'https:' &&
      parsed.protocol !== 'https:'
    ) {
      throw new Error('HTTPS pages must use an HTTPS API.');
    }

    return normalized;
  }

  const API_BASE = getApiBaseUrl();

  const DEFAULT_TIMEOUT_MS = 30000;

  /**
   * Safely retrieve the CSRF token.
   */
  function getCsrfToken() {
    try {
      return sessionStorage.getItem('maison_csrf');
    } catch {
      return null;
    }
  }

  /**
   * Store a CSRF token returned by the backend.
   */
  function storeCsrfToken(payload) {
    const token =
      payload?.csrf_token ||
      payload?.account?.csrf_token;

    if (!token) {
      return;
    }

    try {
      sessionStorage.setItem('maison_csrf', token);
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
  }

  /**
   * Construct consistent API errors.
   */
  function createApiError(message, status = 0, details = {}) {
    const error = new Error(message);

    error.status = status;
    error.details = details;

    return error;
  }

  /**
   * Centralized HTTP request handler.
   *
   * Supports:
   * - JSON request bodies
   * - FormData uploads
   * - AbortSignal
   * - Request timeouts
   * - Credentialed session requests
   */
  async function request(path, options = {}) {
    const endpoint = String(path).replace(/^\/+/, '');

    // Prevent accidental requests to an absolute external URL.
    if (
      /^[a-z][a-z\d+.-]*:/i.test(endpoint) ||
      endpoint.startsWith('//')
    ) {
      throw createApiError('Invalid API endpoint.');
    }

    const url = `${API_BASE}/${endpoint}`;

    const method = (options.method || 'GET').toUpperCase();

    const headers = new Headers(options.headers || {});

    headers.set('Accept', 'application/json');

    // Prevent unsafe methods from being silently issued without CSRF.
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    // Sign-in endpoints are public: a guest has no token yet, and the server issues one after login.
    const csrfExempt = ['auth/login', 'auth/register', 'auth/logout'].includes(endpoint);
    let csrfToken = getCsrfToken();

    if (!safeMethods.includes(method)) {
      if (!csrfToken && !csrfExempt) {
        csrfToken = await ensureCsrfToken();
      }

      if (!csrfToken && !csrfExempt) {
        throw createApiError(
          'Security token missing. Sign in again and retry.'
        );
      }

      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }
    }

    let body = options.body;

    if (
      body !== undefined &&
      body !== null &&
      !(body instanceof FormData) &&
      typeof body !== 'string' &&
      !(body instanceof Blob)
    ) {
      body = JSON.stringify(body);
      headers.set('Content-Type', 'application/json');
    }

    // The browser must set the multipart boundary for FormData.
    if (body instanceof FormData) {
      headers.delete('Content-Type');
    }

    const controller = new AbortController();
    const externalSignal = options.signal;
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;

    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const abortFromExternalSignal = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener(
          'abort',
          abortFromExternalSignal,
          { once: true }
        );
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        method,
        headers,
        body,
        credentials: 'include',
        signal: controller.signal
      });

      const contentType = response.headers.get('content-type') || '';

      let data = {};

      if (response.status !== 204) {
        if (contentType.includes('application/json')) {
          data = await response.json().catch(() => ({}));
        } else {
          const text = await response.text().catch(() => '');

          if (text) {
            throw createApiError(
              `The server did not return JSON (HTTP ${response.status}) for ${url}. Check the API base URL and that PHP is running.`,
              response.status
            );
          }
        }
      }

      // Keep any token the server sends, even on an error response.
      storeCsrfToken(data?.data ?? data);

      if (!response.ok || data?.ok === false) {
        const message =
          data?.error?.message ||
          data?.message ||
          `API request failed (${response.status}).`;

        throw createApiError(
          message,
          response.status,
          data?.error?.details || {}
        );
      }

      const payload = data?.data ?? data;

      storeCsrfToken(payload);

      return payload;
    } catch (error) {
      if (error.status !== undefined) {
        throw error;
      }

      if (timedOut) {
        throw createApiError(
          'The request timed out. Please try again.'
        );
      }

      if (error.name === 'AbortError') {
        throw error;
      }

      if (error instanceof TypeError) {
        throw createApiError(
          'Unable to connect to the server. Check your connection and API configuration.'
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);

      if (externalSignal) {
        externalSignal.removeEventListener(
          'abort',
          abortFromExternalSignal
        );
      }
    }
  }

  /**
   * Before the first write request of a visit, ask the server for a token (GET auth/me).
   * A signed-in account's response carries csrf_token.
   */
  let csrfRequest = null;

  function ensureCsrfToken() {
    const existing = getCsrfToken();

    if (existing) {
      return Promise.resolve(existing);
    }

    if (!csrfRequest) {
      csrfRequest = request('auth/me')
        .catch(() => null)
        .finally(() => { csrfRequest = null; });
    }

    return csrfRequest.then(getCsrfToken);
  }

  /**
   * Current storefront domain.
   * Retained for compatibility with your multi-store API.
   */
  function getDomain() {
    return window.location.hostname;
  }

  function withDomain(params = {}) {
    const searchParams = new URLSearchParams({
      domain: getDomain(),
      ...params
    });

    return searchParams.toString();
  }

  /**
   * Public Maison API interface.
   *
   * Existing method names are preserved.
   */
  window.MaisonApi = Object.freeze({
    baseUrl: API_BASE,

    request,

    ensureCsrf: ensureCsrfToken,

    // Public storefront
    getStore: () =>
      request(`public/store?${withDomain()}`),

    getProducts: (params = {}) =>
      request(`public/products?${withDomain(params)}`),

    getProduct: slug =>
      request(`public/products/${encodeURIComponent(slug)}?${withDomain({})}`),

    // Authentication
    login: (email, password) =>
      request('auth/login', {
        method: 'POST',
        body: {
          email,
          password,
          domain: getDomain()
        }
      }),

    register: customer =>
      request('auth/register', {
        method: 'POST',
        body: {
          ...customer,
          domain: getDomain()
        }
      }),

    logout: () =>
      request('auth/logout', {
        method: 'POST'
      }),

    me: () =>
      request('auth/me'),

    // Admin product management
    adminProducts: () =>
      request('admin/products'),

    adminCategories: () =>
      request('admin/categories'),

    adminProduct: id =>
      request(`admin/products/${encodeURIComponent(id)}`),

    createProduct: product =>
      request('admin/products', {
        method: 'POST',
        body: product
      }),

    updateProduct: (id, product) =>
      request(`admin/products/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: product
      }),

    deleteProduct: id => {
      const body = new FormData();
      body.set('_method', 'DELETE');
      return request(`admin/products/${encodeURIComponent(id)}`, {
        method: 'POST',
        body
      });
    },

    // Admin settings
    getSettings: () =>
      request('admin/settings'),

    updateSettings: payload =>
      request('admin/settings', {
        method: 'PUT',
        body: payload
      })
  });
})();
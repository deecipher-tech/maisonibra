
/**
 * Maison Central API Client
 * Production API + CSRF initialization + session support.
 *
 * IMPORTANT:
 * A client-generated fallback token is temporary. The backend must
 * establish and validate the corresponding session-bound token.
 */
(function () {
  'use strict';

  if (window.MaisonApi) return;

  const PRODUCTION_API_BASE =
    'https://alimanschoolkeffi.com/DeeCommerce/backend/public';

  const DEFAULT_TIMEOUT_MS = 30000;
  const CSRF_KEY = 'maison_csrf';

  function getApiBaseUrl() {
    const configured =
      window.MAISON_API_BASE ||
      PRODUCTION_API_BASE ||
      getLocalBackendUrl();

    let url;

    try {
      url = new URL(configured);
    } catch {
      throw new Error('Invalid Maison API base URL.');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error('API URL must use HTTP or HTTPS.');
    }

    if (
      location.protocol === 'https:' &&
      url.protocol !== 'https:'
    ) {
      throw new Error('An HTTPS website requires an HTTPS API.');
    }

    return url.href.replace(/\/+$/, '');
  }

  function getLocalBackendUrl() {
    const path = location.pathname.replace(/\\/g, '/');
    const adminIndex = path.indexOf('/admin/');

    const rootPath = adminIndex !== -1
      ? path.slice(0, adminIndex)
      : path.replace(/\/[^/]*$/, '');

    return `${location.origin}${rootPath}/backend/public`;
  }

  const API_BASE = getApiBaseUrl();

  function createApiError(message, status = 0, details = {}) {
    const error = new Error(message);
    error.status = status;
    error.details = details;
    return error;
  }

  function readStoredCsrf() {
    try {
      return sessionStorage.getItem(CSRF_KEY);
    } catch {
      return null;
    }
  }

  function storeCsrf(payload) {
    const token =
      payload?.csrf_token ||
      payload?.account?.csrf_token;

    if (typeof token === 'string' && token.length > 0) {
      try {
        sessionStorage.setItem(CSRF_KEY, token);
      } catch {
        // Storage may be unavailable.
      }

      return token;
    }

    return null;
  }

  /**
   * Generates a temporary client-side token.
   *
   * This is NOT automatically accepted by the backend.
   * The backend must issue or register a matching session token.
   */
  async function generateTemporaryCsrf() {
    if (!window.crypto?.getRandomValues) {
      throw createApiError(
        'Secure random token generation is unavailable. Use HTTPS.'
      );
    }

    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);

    const token = Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    try {
      sessionStorage.setItem(CSRF_KEY, token);
    } catch {
      throw createApiError(
        'Unable to store the temporary security token.'
      );
    }

    return token;
  }

  /**
   * Low-level request function.
   * Does not automatically initialize CSRF.
   */
  async function send(path, options = {}) {
    const endpoint = String(path).replace(/^\/+/, '');

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

    let body = options.body;

    if (
      body != null &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      typeof body !== 'string'
    ) {
      body = JSON.stringify(body);
      headers.set('Content-Type', 'application/json');
    }

    if (body instanceof FormData) {
      headers.delete('Content-Type');
    }

    const controller = new AbortController();
    const externalSignal = options.signal;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;

    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    const abortExternal = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', abortExternal, {
          once: true
        });
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

          if (!response.ok) {
            throw createApiError(
              `API request failed (${response.status}).`,
              response.status
            );
          }

          if (text) {
            throw createApiError(
              'The API returned a non-JSON response.',
              response.status
            );
          }
        }
      }

      if (!response.ok || data?.ok === false) {
        throw createApiError(
          data?.error?.message ||
            data?.message ||
            `API request failed (${response.status}).`,
          response.status,
          data?.error?.details || {}
        );
      }

      const payload = data?.data ?? data;
      storeCsrf(payload);

      return payload;
    } catch (error) {
      if (error.status !== undefined) throw error;

      if (timedOut) {
        throw createApiError('The API request timed out.');
      }

      if (error.name === 'AbortError') throw error;

      if (error instanceof TypeError) {
        throw createApiError(
          `Cannot reach API at ${API_BASE}. Check the URL, server status and CORS configuration.`
        );
      }

      throw error;
    } finally {
      clearTimeout(timer);

      externalSignal?.removeEventListener('abort', abortExternal);
    }
  }

  /**
   * Obtain a token from the backend before unsafe requests.
   *
   * Expected backend route:
   * GET /auth/csrf
   *
   * If the route fails, a temporary token is generated. This fallback
   * does not bypass backend CSRF validation and may not authenticate
   * successfully until the backend implements the matching mechanism.
   */
  let csrfInitialization = null;

  async function initializeCsrf(forceRefresh = false) {
    if (!forceRefresh) {
      const existing = readStoredCsrf();
      if (existing) return existing;
    }

    if (csrfInitialization) return csrfInitialization;

    csrfInitialization = (async () => {
      try {
        const payload = await send('auth/csrf', {
          method: 'GET'
        });

        const token = storeCsrf(payload);

        if (token) return token;

        throw createApiError(
          'The CSRF endpoint did not return a token.'
        );
      } catch (error) {
        console.warn(
          'Backend CSRF initialization failed:',
          error.message
        );

        return generateTemporaryCsrf();
      }
    })();

    try {
      return await csrfInitialization;
    } finally {
      csrfInitialization = null;
    }
  }

  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  /**
   * Public request method.
   */
  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();

    if (!SAFE_METHODS.has(method)) {
      const token = await initializeCsrf();

      if (!token) {
        throw createApiError('Unable to initialize CSRF protection.');
      }

      const headers = new Headers(options.headers || {});
      headers.set('X-CSRF-Token', token);

      options = { ...options, headers };
    }

    return send(path, options);
  }

  function getDomain() {
    return location.hostname;
  }

  function withDomain(params = {}) {
    return new URLSearchParams({
      ...params,
      domain: getDomain()
    }).toString();
  }

  window.MaisonApi = Object.freeze({
    baseUrl: API_BASE,
    request,
    initializeCsrf,

    // Public storefront
    getStore: () => request(`public/store?${withDomain()}`),

    getProducts: (params = {}) =>
      request(`public/products?${withDomain(params)}`),

    // Authentication
    login: async (email, password) => {
      await initializeCsrf();

      return request('auth/login', {
        method: 'POST',
        body: { email, password, domain: getDomain() }
      });
    },

    register: async customer => {
      await initializeCsrf();

      return request('auth/register', {
        method: 'POST',
        body: { ...customer, domain: getDomain() }
      });
    },

    logout: () => request('auth/logout', { method: 'POST' }),

    me: () => request('auth/me'),

    // Admin product management
    adminProducts: () => request('admin/products'),

    adminCategories: () => request('admin/categories'),

    adminProduct: id =>
      request(`admin/products/${encodeURIComponent(id)}`),

    createProduct: product =>
      request('admin/products', {
        method: 'POST',
        body: product
      }),

    updateProduct: (id, product) =>
      request(`admin/products/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: product
      }),

    deleteProduct: id =>
      request(`admin/products/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      }),

    // Multipart upload helper for product images
    uploadProduct: formData =>
      request('admin/products', {
        method: 'POST',
        body: formData
      }),

    getSettings: () => request('admin/settings'),

    updateSettings: payload =>
      request('admin/settings', {
        method: 'PUT',
        body: payload
      })
  });
})();

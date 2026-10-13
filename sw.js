/* MAISON IBRA service worker.
 *
 * Two kinds of version exist, on purpose:
 *   APP_VERSION  - the code of THIS file. Bump it when you change the strategies or the precache list below. A new value
 *                  changes the file's bytes, so the browser installs a new worker, which then waits (see "update flow").
 *   release      - the content version an admin publishes in Admin > Settings > App (PWA) > "Publish update".
 *                  It lives on the server; the page compares it with the one this device last applied (pwa.js),
 *                  then asks this worker to refresh its caches (APPLY_RELEASE). No file edit needed.
 *
 * Update flow: a new worker installs in the background and WAITS. pwa.js shows "Update available". Update now sends
 * SKIP_WAITING, the worker activates, the page reloads once. Nothing is skipped automatically, so a customer in the
 * middle of checkout is never reloaded under their feet. The bag lives in localStorage and the session in a cookie,
 * and the worker never touches either.
 */
const APP_VERSION = 'v1.0.0';

const STATIC = `maison-static-${APP_VERSION}`; // precached shell + assets (stale-while-revalidate)
const PAGES = `maison-pages-${APP_VERSION}`;   // pages visited, for offline
const API = `maison-api-${APP_VERSION}`;       // catalogue reads, for offline browsing
const IMAGES = 'maison-images';                // product images: names are unique per upload, so they survive releases
const FONTS = 'maison-fonts';
const META = 'maison-meta';
const KEEP = [STATIC, PAGES, API, IMAGES, FONTS, META];

const SHELL = [
  'offline.html', 'index.html', 'shop.html', 'product.html', 'about.html', 'contact.html', 'login.html', 'account.html',
  'category1.html', 'category2.html', 'category3.html', 'shipping.html', 'returns.html', 'privacy.html', 'terms.html',
  'assets/css/styles.css', 'assets/css/ui.css', 'assets/css/shop.css', 'assets/css/product.css', 'assets/css/about.css', 'assets/css/contact.css',
  'assets/css/pages.css', 'assets/css/perfumes.css', 'assets/css/skincare.css', 'assets/css/makeup.css',
  'assets/js/ui.js', 'assets/js/config.js', 'assets/js/api.js', 'assets/js/script.js', 'assets/js/products.js', 'assets/js/storefront.js',
  'assets/js/shop.js', 'assets/js/category.js', 'assets/js/product.js', 'assets/js/contact.js', 'assets/js/account.js', 'assets/js/pwa.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/apple-touch-icon.png', 'assets/images/logo.png'
];

const NETWORK_ONLY = /\/(auth|admin|account)\/|\/public\/(cart|orders|bank-accounts|pwa|manifest|contact|newsletter)|manifest\.json$/;
const CATALOGUE = /\/public\/(store|products|categories)(\/|$|\?)/;
const base = path => new URL(path, self.registration.scope).href;

async function precache(cache) {
  const results = await Promise.allSettled(SHELL.map(p => cache.add(new Request(base(p), { cache: 'reload' }))));
  // The offline page is the one thing that must exist; the rest is best effort (a missing logo must not block installing).
  if (!(await cache.match(base('offline.html')))) throw new Error('offline.html could not be cached');
  return results;
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC).then(precache)); // no skipWaiting here: see "update flow"
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('maison-') && !KEEP.includes(n)).map(n => caches.delete(n)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (e) {} }
    await self.clients.claim();
  })());
});

/* ---------- messages from the page ---------- */
async function getRelease() {
  const res = await (await caches.open(META)).match('release');
  return res ? res.text() : '';
}
async function applyRelease(version) {
  await Promise.all([caches.delete(PAGES), caches.delete(API)]);       // stale pages and catalogue data
  await precache(await caches.open(STATIC));                           // fresh shell, bypassing the HTTP cache
  await (await caches.open(META)).put('release', new Response(String(version || '')));
}
self.addEventListener('message', event => {
  const data = event.data || {}, port = event.ports && event.ports[0];
  const reply = payload => port && port.postMessage(payload);
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION') {
    event.waitUntil(getRelease().then(release => reply({ appVersion: APP_VERSION, release })));
  } else if (data.type === 'APPLY_RELEASE') {
    event.waitUntil(applyRelease(data.version).then(() => reply({ ok: true }), () => reply({ ok: false })));
  }
});

/* ---------- helpers ---------- */
async function trim(name, max) {
  const cache = await caches.open(name), keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
const json503 = () => new Response(JSON.stringify({ ok: false, error: { message: 'You appear to be offline. Check your connection and try again.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } });

function staleWhileRevalidate(event, cacheName) {
  return caches.open(cacheName).then(async cache => {
    const cached = await cache.match(event.request);
    const network = fetch(event.request).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(event.request, res.clone()); return res; }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || Response.error();
  });
}

async function navigation(event) {
  const url = new URL(event.request.url);
  const key = base(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname); // page shell, ignoring ?slug=...
  const cache = await caches.open(PAGES);
  const fallback = async () => (await cache.match(key)) || (await caches.match(key, { ignoreSearch: true })) || (await caches.match(base('offline.html')));
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    let res = preload;
    if (!res) {
      const known = await cache.match(key);
      const net = fetch(event.request);
      // With a saved copy, give up on a very slow network after 6s; without one, keep waiting for the real page.
      res = known ? await Promise.race([net, timeout(6000)]) : await net;
    }
    if (res && res.ok && !res.redirected && res.type === 'basic') cache.put(key, res.clone());
    return res;
  } catch (e) {
    return fallback();
  }
}

async function catalogue(event) {
  const cache = await caches.open(API);
  try {
    const res = await Promise.race([fetch(event.request), timeout(8000)]);
    if (res && res.ok) { cache.put(event.request, res.clone()); }
    return res;
  } catch (e) {
    return (await cache.match(event.request)) || json503();
  }
}

async function productImage(event) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  try {
    const res = await fetch(event.request);
    if (res && (res.ok || res.type === 'opaque')) { cache.put(event.request, res.clone()); trim(IMAGES, 120); }
    return res;
  } catch (e) { return Response.error(); }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event, FONTS));
    return;
  }
  if (NETWORK_ONLY.test(url.pathname)) return;                                 // prices, stock, sessions, admin: always live
  if (/\/media\/products\//.test(url.pathname)) { event.respondWith(productImage(event)); return; }
  if (CATALOGUE.test(url.pathname + url.search)) { event.respondWith(catalogue(event)); return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') { event.respondWith(navigation(event)); return; }
  if (/\.(?:css|js|png|jpe?g|webp|svg|gif|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, STATIC));
  }
});

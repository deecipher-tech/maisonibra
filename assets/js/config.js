/* API address. Load this BEFORE api.js on every page.
   - XAMPP / localhost: nothing to set (api.js finds backend/public next to the pages).
   - Vercel (*.vercel.app): calls go to /api on the same site, and vercel.json forwards them to the PHP server.
     The browser sees one site, so there is no CORS and the login cookie is not treated as third-party.
   - Any other host: calls the PHP API directly (that API must allow your site in frontend_origins). */
(function () {
  const host = location.hostname;
  if (['127.0.0.1', 'localhost'].includes(host)) return;
  window.MAISON_API_BASE = host.endsWith('.vercel.app')
    ? `${location.origin}/api`
    : 'https://alimanschoolkeffi.com/DeeCommerce/backend/public';
})();

/* Optional API address. Load this BEFORE api.js.
   XAMPP / localhost: nothing to set. api.js finds backend/public next to your pages automatically,
   e.g. page http://localhost/MAISON%20IBRA/index.html -> API http://localhost/MAISON%20IBRA/backend/public

   Live site (Vercel): use the SAME-ORIGIN '/api' path. vercel.json rewrites /api/* to the PHP backend, so the login cookie
   belongs to your own domain. Calling the backend's domain directly makes the cookie third-party, which mobile browsers
   (iOS Safari, Chrome on Android) block, and customers/admins are signed out on the very next request. */
(function () {
  const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const onBackendHost = location.hostname === 'alimanschoolkeffi.com'; // site and API on one host: no proxy needed
  if (!isLocal && !onBackendHost) window.MAISON_API_BASE = '/api';
})();

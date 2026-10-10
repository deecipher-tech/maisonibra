/* Optional API address. Load this BEFORE api.js.
   XAMPP / localhost: nothing to set. api.js finds backend/public next to your pages automatically,
   e.g. page http://localhost/MAISON%20IBRA/index.html -> API http://localhost/MAISON%20IBRA/backend/public
   Live site: set the real API address below. */
(function () {
  const isLocal = ['127.0.0.1', 'localhost'].includes(location.hostname);
  if (!isLocal) window.MAISON_API_BASE = 'https://alimanschoolkeffi.com/DeeCommerce/backend/public';
})();
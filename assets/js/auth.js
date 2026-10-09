/* Front-end sign-in helpers shared by login.html and admin.html.
   NOTE: this only gates the page in the browser. Real protection needs server-side authentication. */
const AUTH_KEY = 'ibra_auth', SESSION_KEY = 'ibra_session';
const getHash = () => { try { return localStorage.getItem(AUTH_KEY); } catch (e) { return null; } };
async function hashPw(pw) {
  const text = 'ibra:' + pw;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return btoa(unescape(encodeURIComponent(text)));
}
/* Sign in, or create the first admin password. Front-end only (see auth.js). */
const $ = s => document.querySelector(s);
if (sessionStorage.getItem(SESSION_KEY)) location.replace('admin.html');
const firstRun = !getHash();
if (firstRun) {
  $('#loginTitle').textContent = 'Create admin password';
  $('#loginHint').textContent = 'Choose a password of at least 8 characters.';
  $('#pwLabel').textContent = 'New password';
  $('#pw').autocomplete = 'new-password';
  $('#confirmField').hidden = false;
  $('#loginBtn').textContent = 'Create password';
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#pw').value, err = $('#loginErr');
  err.textContent = '';
  if (firstRun) {
    if (pw.length < 8) return err.textContent = 'Use at least 8 characters.';
    if (pw !== $('#pw2').value) return err.textContent = 'The passwords do not match.';
    try { localStorage.setItem(AUTH_KEY, await hashPw(pw)); } catch (x) { return err.textContent = 'Could not save in this browser.'; }
  } else if (await hashPw(pw) !== getHash()) {
    return err.textContent = 'Incorrect password.';
  }
  sessionStorage.setItem(SESSION_KEY, '1');
  location.replace('./admin/index.html');
});
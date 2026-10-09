/* Shared account entry. Customers stay on the storefront; admins go to the dashboard. */
const $ = s => document.querySelector(s);
const CUSTOMER_KEY = 'maison_customer';

if (sessionStorage.getItem(SESSION_KEY)) location.replace('./admin/index.html');

let mode = 'signin';

function setMode(next) {
  mode = next;
  const isRegister = mode === 'register';
  $('#loginTitle').textContent = isRegister ? 'Create account' : 'Sign in';
  $('#loginHint').textContent = isRegister
    ? 'Create a customer account for faster checkout and order details.'
    : 'Customers sign in here.';
  $('#loginBtn').textContent = isRegister ? 'Create account' : 'Sign in';
  $('#pwLabel').textContent = isRegister ? 'Create password' : 'Password';
  $('#pw').autocomplete = isRegister ? 'new-password' : 'current-password';
  $('#confirmField').hidden = !isRegister;
  document.querySelectorAll('.register-only').forEach(el => { el.hidden = !isRegister; });
  document.querySelectorAll('.login-tab').forEach(tab => tab.setAttribute('aria-selected', tab.dataset.mode === mode));
  $('#loginErr').textContent = '';
}

document.querySelectorAll('.login-tab').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
setMode('signin');

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const pw = $('#pw').value;
  const err = $('#loginErr');
  err.textContent = '';

  if (!email || !$('#email').checkValidity()) return err.textContent = 'Enter a valid email address.';
  if (!pw) return err.textContent = 'Enter your password.';

  if (mode === 'register') {
    if (!$('#name').value.trim()) return err.textContent = 'Enter your full name.';
    if (pw.length < 8) return err.textContent = 'Use at least 8 characters.';
    if (pw !== $('#pw2').value) return err.textContent = 'The passwords do not match.';
  }

  try {
    if (!window.MaisonApi) throw new Error('API client is not available.');
    const result = mode === 'register'
      ? await MaisonApi.register({ name: $('#name').value.trim(), email, phone: $('#phone').value.trim(), password: pw })
      : await MaisonApi.login(email, pw);
    const account = result.account || {};

    if (account.type === 'admin') {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(account.user || true));
      location.replace('./admin/index.html');
      return;
    }

    if (account.type === 'customer') {
      sessionStorage.setItem(CUSTOMER_KEY, JSON.stringify(account.customer || true));
      location.replace(sessionStorage.getItem('maison_after_login') || './index.html');
      return;
    }

    err.textContent = 'Signed in, but the account type was not recognized.';
  } catch (error) {
    const details = error.details || {};
    err.textContent = details.email || details.name || details.password || error.message || 'Could not continue.';
  }
});

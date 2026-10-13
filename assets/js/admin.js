/* Admin dashboard. Products, categories, settings and the password are saved through the API (MaisonApi).
   The storefront (Home / About / Contact, menu, footer), orders and customers are loaded from and saved to the API too. */
/* The server session (cookie) decides who is signed in: see ensureAdminSession(). sessionStorage is per tab and phones
   discard or restore tabs freely, so it must not be used as the gate. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const toastEl = $('.toast'); let tt;
function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('show'), 2400); }
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Storage is full. Use smaller images.'); return false; } }
};
const getp = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setp = (o, p, v) => { const ks = p.split('.'); let t = o; ks.slice(0, -1).forEach(k => t = t[k] ??= {}); t[ks[ks.length - 1]] = v; };

let settings = {}; // settings come from the API (loadSettings)
const adminAsset = v => /^\.\//.test(v || '') ? '.' + v : (v || ''); // './assets/x.png' -> '../assets/x.png' (admin lives in /admin)
const cur = () => settings.general?.currency || '₦';
const fmt = n => n == null || n === '' ? '—' : cur() + Number(n).toLocaleString('en-NG');
const CATS = { perfume: 'Perfume', skincare: 'Skincare', makeup: 'Makeup' };
const ORDERS = [];                                  // filled from the API by loadOrders(): { id (order no.), dbId, customer, email, phone, date:'YYYY-MM-DD', total, status, payment, fulfilment, receipt }
const customerSummary = { total: 0, active: 0, disabled: 0 }; // filled by loadCustomers()

/* ---------- Loading skeletons and error states (tables, stats, forms) ---------- */
const skRows = (cols, n = 5) => Array.from({ length: n }, () => `<tr class="sk-row" aria-hidden="true">${Array.from({ length: cols }, (_, i) => `<td><span class="sk sk-line" style="width:${i === 0 ? '75%' : '55%'}"></span></td>`).join('')}</tr>`).join('');
const skGroups = n => Array.from({ length: n }, () => '<div class="card sk-group" aria-hidden="true"><span class="sk sk-line" style="width:30%;height:22px"></span></div>').join('');
const skClear = id => { const e = $(id); if (e) e.classList.remove('sk', 'sk-inline'); };
function tableState(bodySel, cols, message, retry) {
  const body = $(bodySel); if (!body) return;
  body.innerHTML = `<tr><td colspan="${cols}"><div class="empty"><strong>${esc(message)}</strong><br><button type="button" class="btn btn-ghost" data-tbl-retry style="margin-top:12px">Try again</button></div></td></tr>`;
  const b = $('[data-tbl-retry]', body); if (b) b.onclick = () => { b.disabled = true; retry(); };
}
let ordersLoaded = false, customersLoaded = false, catsLoaded = false;

/* ---------- Navigation ---------- */
const TITLES = { dashboard: 'Dashboard', products: 'Products', categories: 'Categories & Sub-categories', orders: 'Orders', customers: 'Customers', account: 'Account', storefront: 'Storefront', settings: 'Settings' };
const side = $('#side'), scrim = $('#scrim'), burger = $('#burger');
function setSide(open) { side.classList.toggle('open', open); scrim.hidden = !open; burger.setAttribute('aria-expanded', open); }
function route() {
  const v = TITLES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  $$('[data-view]').forEach(s => s.hidden = s.dataset.view !== v);
  $$('[data-nav]').forEach(a => a.dataset.nav === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  $('#viewTitle').textContent = TITLES[v];
  document.title = `${TITLES[v]} | MAISON IBRA Admin`;
  if (v === 'account') renderAccount();
  if (v === 'categories') renderCategories();
  if (v === 'customers') loadCustomers();
  if (v === 'storefront') showStorefront();
  setSide(false);
}
burger.addEventListener('click', () => setSide(!side.classList.contains('open')));
scrim.addEventListener('click', () => setSide(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setSide(false); });
addEventListener('hashchange', route);
function applyLogo() {
  const img = $('#sideLogo'), name = $('#sideName');
  img.hidden = false;
  if (name) name.hidden = true;
  img.onerror = () => {
    img.hidden = true;
    if (name) {
      name.textContent = settings.general?.appName || 'MAISON IBRA';
      name.hidden = false;
    }
  };
  const src = adminAsset(settings.general?.logo) || '../assets/images/logo.png';
  if (img.getAttribute('src') !== src) img.src = src; else if (img.complete && !img.naturalWidth) img.onerror();
}
$('#logout').addEventListener('click', async e => {
  e.preventDefault();
  if (e.currentTarget.dataset.busy) return;
  setBusy(e.currentTarget, true, 'Signing out...');
  try { if (window.MaisonApi) await MaisonApi.logout(); } catch (error) {}
  sessionStorage.removeItem(SESSION_KEY);
  location.replace('../login.html');
});
async function ensureAdminSession() {
  if (!window.MaisonApi) return;
  let data;
  try {
    data = await MaisonApi.me();
  } catch (error) {
    if (error.status) throw error;                    // the server answered: respect it
    await new Promise(r => setTimeout(r, 800));       // no answer (weak mobile data): try once more
    data = await MaisonApi.me();
  }
  if (data.account?.type !== 'admin') {
    const err = new Error('Please sign in again.');
    err.status = 401;
    throw err;
  }
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
}

/* ---------- Generic form fields (settings + storefront) ---------- */
const T = (k, label, o = {}) => ({ k, label, ...o });
function fieldHTML(f, obj) {
  const v = getp(obj, f.k) ?? f.d ?? '', id = 'f_' + f.k.replace(/\./g, '_'), p = `data-path="${f.k}"`;
  if (f.type === 'toggle') return `<div class="field"><label class="switch"><input type="checkbox" id="${id}" ${p} ${v === 'on' ? 'checked' : ''}><span class="knob"></span><span>${esc(f.label)}</span></label>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}</div>`;
  if (f.type === 'image') return `<div class="field"><label for="${id}">${esc(f.label)}</label><div class="img-row"><img src="${esc(adminAsset(v))}" alt="" ${v ? '' : 'hidden'}><input type="text" id="${id}" ${p} value="${esc(v)}" placeholder="Path, URL or upload" /><button type="button" class="btn btn-ghost" data-upload>Upload</button><input type="file" accept="image/*" hidden></div>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}</div>`;
  const hint = f.hint ? `<p class="hint">${esc(f.hint)}</p>` : '';
  let input;
  if (f.type === 'textarea') input = `<textarea id="${id}" ${p} rows="${f.rows || 3}">${esc(v)}</textarea>`;
  else if (f.type === 'money') input = `<input id="${id}" ${p} data-raw type="number" inputmode="decimal" step="${f.step || '0.01'}" min="0" value="${esc(v)}">`;
  else if (f.type === 'color') input = `<input id="${id}" ${p} type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(v) ? v : (f.d || '#000000'))}" style="padding:3px;height:42px;max-width:120px">`;
  else if (f.type === 'select') input = `<select id="${id}" ${p}>${f.options.map(([val, label]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  else input = `<input id="${id}" ${p} type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(v)}" ${f.type === 'number' ? 'min="1" max="24"' : ''}>`;
  return `<div class="field"><label for="${id}">${esc(f.label)}</label>${input}${hint}</div>`;
}
function bindImages(root, upload) {
  // upload(file) -> Promise<{ url }>: when given, the file is uploaded to the server and its URL is used.
  // Without it (storefront editor) the image is embedded as a data URL, as before.
  root.addEventListener('click', e => { const b = e.target.closest('[data-upload]'); if (b) b.parentElement.querySelector('input[type=file]').click(); });
  root.addEventListener('change', async e => {
    if (e.target.type !== 'file' || !e.target.files[0]) return;
    const input = e.target, file = input.files[0], row = input.parentElement;
    const text = row.querySelector('input[type=text]'), img = row.querySelector('img');
    if (upload) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { input.value = ''; return toast('Use a JPEG, PNG or WebP image.'); }
      if (file.size > 2 * 1024 * 1024) { input.value = ''; return toast('Image must be 2MB or smaller.'); }
      const btn = row.querySelector('[data-upload]'); btn.disabled = true; btn.textContent = 'Uploading...';
      try { const res = await upload(file); text.value = res.url; img.src = res.url; img.hidden = false; text.dispatchEvent(new Event('input', { bubbles: true })); toast('Image uploaded. Click Save changes to apply it.'); }
      catch (error) { toast(error.message || 'Upload failed.'); }
      finally { btn.disabled = false; btn.textContent = 'Upload'; input.value = ''; }
      return;
    }
    if (file.size > 600 * 1024) { input.value = ''; return toast('Image is over 600KB. Use a smaller image or a file path.'); }
    const r = new FileReader();
    r.onload = () => { text.value = r.result; img.src = r.result; img.hidden = false; };
    r.readAsDataURL(file);
  });
  root.addEventListener('input', e => { if (e.target.type === 'text' && e.target.parentElement.classList.contains('img-row')) { const i = e.target.parentElement.querySelector('img'); i.src = adminAsset(e.target.value); i.hidden = !e.target.value; } });
}
function collect(root, obj) {
  $$('[data-path]', root).forEach(el => setp(obj, el.dataset.path, el.type === 'checkbox' ? (el.checked ? 'on' : 'off') : el.type === 'number' && el.dataset.raw === undefined ? Math.max(1, Math.min(24, +el.value || 1)) : el.value.trim()));
  return obj;
}

/* ---------- Settings (loaded from and saved to the API; one section is saved at a time) ---------- */
const SETTINGS = {
  general: [T('general.appName', 'App name', { d: 'MAISON IBRA' }), T('general.currency', 'Currency symbol', { d: '₦' }), T('general.status', 'Platform is live', { type: 'toggle', d: 'on', hint: 'Turn off to show visitors a "back soon" page. You can still use this admin.' }), T('general.logo', 'Logo', { type: 'image' }), T('general.favicon', 'Favicon', { type: 'image' })],
  contact: [T('contact.email', 'Email address'), T('contact.supportEmail', 'Support email'), T('contact.phone', 'Phone number'), T('contact.whatsapp', 'WhatsApp number'), T('contact.address', 'Address', { type: 'textarea' }), T('contact.hours', 'Opening hours')],
  delivery: [T('delivery.fee', 'Delivery fee', { type: 'money', hint: 'Added to every order at checkout. Leave 0 for free delivery.' }), T('delivery.free_threshold', 'Free delivery from', { type: 'money', hint: 'Orders with a subtotal at or above this amount ship free. 0 turns the threshold off.' }), T('delivery.estimate', 'Delivery time note', { hint: 'Shown on the shipping and product pages, for example "2 to 5 working days".' })],
  pwa: [
    T('pwa.name', 'App name', { hint: 'The full name shown when installing and on the splash screen.' }), T('pwa.short_name', 'Short name', { hint: 'Shown under the home-screen icon. About 12 characters fit.' }),
    T('pwa.description', 'Description', { type: 'textarea' }),
    T('pwa.theme_color', 'Theme color', { type: 'color', d: '#070605', hint: 'Colors the browser bar and app title bar.' }), T('pwa.background_color', 'Background color', { type: 'color', d: '#070605', hint: 'Shown while the app opens.' }),
    T('pwa.display', 'Display mode', { type: 'select', d: 'standalone', options: [['standalone', 'App window (recommended)'], ['minimal-ui', 'App window with browser controls'], ['fullscreen', 'Full screen']] }),
    T('pwa.icon_192', 'App icon 192 x 192 (PNG)', { type: 'image' }), T('pwa.icon_512', 'App icon 512 x 512 (PNG)', { type: 'image' }),
    T('pwa.icon_maskable', 'Adaptive icon 512 x 512 (PNG)', { type: 'image', hint: 'Keep the logo inside the centre 80% so Android can crop it to any shape. Optional.' }),
    T('pwa.install_enabled', 'Show the install popup', { type: 'toggle', d: 'on' }), T('pwa.install_delay', 'Show it after (seconds on the site)', { type: 'money', step: '1', d: '60' }),
    T('pwa.install_title', 'Popup title', { hint: 'Use {name} for the app name.' }), T('pwa.install_text', 'Popup text', { type: 'textarea' })
  ],
  social: [T('social.instagram', 'Instagram URL'), T('social.tiktok', 'TikTok URL'), T('social.facebook', 'Facebook URL'), T('social.x', 'X (Twitter) URL'), T('social.whatsapp', 'WhatsApp link')]
};
const STABS = [['general', 'General'], ['payments', 'Payments'], ['delivery', 'Delivery'], ['pwa', 'App (PWA)'], ['contact', 'Contact'], ['social', 'Social'], ['security', 'Security']];
let banks = [], settingsLoaded = false, activeTab = 'general';

const RX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, RX_URL = /^https?:\/\/\S+$/i, RX_PHONE = /^[0-9+()\-\s]{6,30}$/, RX_MEDIA = /^(https?:\/\/|\.\/)\S*$/i;
// Mirrors the server rules for instant feedback; the server remains the authority. Returns { 'section.field': message }.
function checkSection(section, d) {
  const e = {};
  if (section === 'general') {
    if (!d.appName) e['general.appName'] = 'App name is required.';
    if (!d.currency || d.currency.length > 8) e['general.currency'] = 'Currency symbol is required (8 characters at most).';
    ['logo', 'favicon'].forEach(k => { if (d[k] && !RX_MEDIA.test(d[k])) e[`general.${k}`] = 'Upload an image, or use a relative path or an http(s) URL.'; });
  } else if (section === 'contact') {
    ['email', 'supportEmail'].forEach(k => { if (d[k] && !RX_EMAIL.test(d[k])) e[`contact.${k}`] = 'Enter a valid email address.'; });
    ['phone', 'whatsapp'].forEach(k => { if (d[k] && !RX_PHONE.test(d[k])) e[`contact.${k}`] = 'Use digits, spaces, +, - and brackets only (6-30 characters).'; });
  } else if (section === 'social') {
    Object.keys(d).forEach(k => { if (d[k] && !RX_URL.test(d[k])) e[`social.${k}`] = 'Enter a full link starting with http:// or https://.'; });
  } else if (section === 'delivery') {
    ['fee', 'free_threshold'].forEach(k => { if (d[k] !== '' && (isNaN(+d[k]) || +d[k] < 0)) e[`delivery.${k}`] = 'Enter a number from 0 upwards.'; });
  } else if (section === 'pwa') {
    if (!d.name) e['pwa.name'] = 'App name is required.';
    if (!d.short_name) e['pwa.short_name'] = 'Short name is required.';
    ['theme_color', 'background_color'].forEach(k => { if (!/^#[0-9a-f]{6}$/i.test(d[k] || '')) e[`pwa.${k}`] = 'Choose a color.'; });
    ['icon_192', 'icon_512', 'icon_maskable'].forEach(k => { if (d[k] && !RX_MEDIA.test(d[k])) e[`pwa.${k}`] = 'Upload an image, or use a relative path or an http(s) URL.'; });
    if (!/^\d+$/.test(String(d.install_delay)) || +d.install_delay < 10 || +d.install_delay > 3600) e['pwa.install_delay'] = 'Enter 10 to 3600 seconds.';
  } else if (section === 'banks') {
    d.forEach((b, i) => {
      if (!b.bank) e[`banks.${i}.bank`] = 'Enter the bank name.';
      if (!b.name) e[`banks.${i}.name`] = 'Enter the account name.';
      if (!/^\d{6,20}$/.test(b.number)) e[`banks.${i}.number`] = 'Account number must be 6-20 digits.';
    });
  }
  return e;
}
const errTarget = k => k.startsWith('banks.') ? `[data-bank="${k.slice(6)}"]` : k === 'current_password' ? '#curPw' : k === 'new_password' ? '#newPw' : k === 'confirm' ? '#newPw2' : `[data-path="${k}"]`;
function showFormErrors(form, errors, fallback = '') {
  $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
  const keys = Object.keys(errors || {}), box = $('.err', form);
  keys.forEach(k => $(errTarget(k), form)?.setAttribute('aria-invalid', 'true'));
  if (box) box.textContent = keys.length ? errors[keys[0]] : fallback;
  if (keys.length) $(errTarget(keys[0]), form)?.focus();
}
const setBusy = (btn, on, text) => {
  if (!btn) return;
  if (on) { if (btn.dataset.busy) return; btn.dataset.busy = '1'; btn.dataset.label = btn.textContent; btn.textContent = text; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); }
  else { delete btn.dataset.busy; if (btn.dataset.label) btn.textContent = btn.dataset.label; btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); }
  btn.disabled = on;
};
function backToLogin() { sessionStorage.removeItem(SESSION_KEY); location.replace('../login.html'); }

function setSettingsState(kind, text, retry = false) {
  const box = $('#settingsState'), panels = $('#settingsPanels');
  box.hidden = !text; box.classList.toggle('error', kind === 'error');
  $('#settingsStateText').textContent = text || '';
  $('#settingsRetry').hidden = !retry;
  panels.toggleAttribute('inert', !settingsLoaded); // nothing can be saved until the real values have loaded
  panels.classList.toggle('is-skeleton', !settingsLoaded && kind !== 'error');
  panels.style.opacity = settingsLoaded || kind !== 'error' ? '' : '.55';
}
async function loadSettings() {
  if (!window.MaisonApi) return;
  setSettingsState('info', 'Loading settings...');
  try {
    const data = await MaisonApi.getSettings();
    settings = data.settings || {};
    banks = (settings.banks || []).map(b => ({ ...b }));
    settingsLoaded = true;
    renderSettings(); applyLogo(); refresh();
    setSettingsState('info', '');
  } catch (error) {
    if (error.status === 401) return backToLogin();
    settingsLoaded = false;
    setSettingsState('error', (error.message || 'Could not load settings.') + ' Saving is disabled until they load.', true);
  }
}
$('#settingsRetry').addEventListener('click', loadSettings);

const groupForm = k => `<form class="pform" data-group="${k}" novalidate>${SETTINGS[k].map(f => fieldHTML(f, settings)).join('')}<p class="err" role="alert"></p><div><button class="btn" type="submit">Save changes</button></div></form>`;
function bankRows() {
  $('#bankList').innerHTML = banks.length ? banks.map((b, i) => `<div class="bank-row"><div class="field"><label for="bk${i}">Bank name</label><input id="bk${i}" data-bank="${i}.bank" maxlength="120" value="${esc(b.bank)}"></div><div class="field"><label for="bn${i}">Account name</label><input id="bn${i}" data-bank="${i}.name" maxlength="160" value="${esc(b.name)}"></div><div class="field"><label for="bu${i}">Account number</label><input id="bu${i}" data-bank="${i}.number" inputmode="numeric" maxlength="20" value="${esc(b.number)}"></div><div class="field"><label class="switch"><input type="checkbox" data-bank="${i}.active" ${b.active === false ? '' : 'checked'}><span class="knob"></span><span>Active</span></label><p class="hint">Only active accounts are shown at checkout.</p></div><button type="button" class="link-btn del" data-rmbank="${i}">Remove bank</button></div>`).join('') : '<p class="hint">No bank accounts yet. Add one to receive payments.</p>';
}
function readBanks() { $$('[data-bank]').forEach(el => { const [i, k] = el.dataset.bank.split('.'); if (banks[i]) banks[i][k] = el.type === 'checkbox' ? el.checked : el.value.trim(); }); }

function pwaReleaseHTML() {
  const v = settings.pwa || {}, when = v.released_at ? new Date(v.released_at).toLocaleString() : '';
  return `<div class="release-card" id="pwaRelease"><div><strong>Installed app version <span id="pwaVer">${esc(v.version || '1.0.0')}</span></strong><p class="hint" id="pwaVerHint">${when ? 'Last published ' + esc(when) + '.' : 'No update has been published yet.'}</p></div><div class="row-btns"><select id="pwaBump" aria-label="Release type"><option value="patch">Small fix (patch)</option><option value="minor">New content (minor)</option><option value="major">Big change (major)</option></select><button type="button" class="btn" id="pwaPublish">Save &amp; publish update</button></div><p class="err" id="pwaRelErr" role="alert"></p><p class="hint">Save changes only updates the name, colors and icons for new installs. Save &amp; publish update also raises the version, so customers who installed the app see "Update available" the next time they open it.</p></div>`;
}
function renderSettings() {
  $('#settingsTabs').innerHTML = STABS.map(([k, l]) => `<button type="button" role="tab" id="tab-${k}" aria-controls="panel-${k}" aria-selected="${k === activeTab}" tabindex="${k === activeTab ? 0 : -1}" data-tab="${k}">${l}</button>`).join('');
  const panel = (k, body) => `<div class="card" role="tabpanel" id="panel-${k}" aria-labelledby="tab-${k}" ${k === activeTab ? '' : 'hidden'}>${body}</div>`;
  $('#settingsPanels').innerHTML =
    panel('general', groupForm('general')) +
    panel('payments', `<form class="pform" id="bankForm" novalidate><p class="hint">Bank accounts customers can pay into at checkout. Switch an account off to hide it without deleting it (up to 10 accounts).</p><div id="bankList" class="bank-list"></div><p class="err" id="bankErr" role="alert"></p><div class="actions-row"><button type="button" class="btn btn-ghost" id="addBank">Add bank</button><button class="btn" type="submit">Save banks</button></div></form>`) +
    panel('delivery', groupForm('delivery')) + panel('pwa', groupForm('pwa') + pwaReleaseHTML()) +
    panel('contact', groupForm('contact')) + panel('social', groupForm('social')) +
    panel('security', `<form class="pform" id="pwForm" novalidate><div class="field"><label for="curPw">Current password</label><input id="curPw" type="password" autocomplete="current-password"></div><div class="field"><label for="newPw">New password</label><input id="newPw" type="password" autocomplete="new-password"></div><div class="field"><label for="newPw2">Confirm new password</label><input id="newPw2" type="password" autocomplete="new-password"></div><p class="err" id="pwErr" role="alert"></p><div><button class="btn" type="submit">Change password</button></div></form>`);
  bankRows();
}
function showTab(k) {
  activeTab = k;
  $$('[role=tab]').forEach(t => { const on = t.dataset.tab === k; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  $$('[role=tabpanel]').forEach(p => p.hidden = p.id !== 'panel-' + k);
}
$('#settingsTabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) showTab(t.dataset.tab); });
$('#settingsTabs').addEventListener('keydown', e => {
  const tabs = $$('[role=tab]'), i = tabs.indexOf(document.activeElement);
  if (i < 0 || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); showTab(n.dataset.tab);
});

// Sends one section to the API. Returns true when saved (and `settings` now holds what the server stored).
async function saveSection(form, btn, section, data) {
  const local = checkSection(section, data);
  if (Object.keys(local).length) { showFormErrors(form, local); return false; }
  showFormErrors(form, {});
  setBusy(btn, true, 'Saving...');
  try {
    const res = await MaisonApi.updateSettings({ settings: { [section]: data } });
    settings = res.settings || settings;
    return true;
  } catch (error) {
    if (error.status === 401) { backToLogin(); return false; }
    showFormErrors(form, error.details, error.message || 'Could not save settings.');
    toast('Settings were not saved.');
    return false;
  } finally { setBusy(btn, false); }
}
$('#settingsPanels').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, btn = $('button[type=submit]', f);
  if (!settingsLoaded || !window.MaisonApi) return toast('Settings have not loaded yet.');
  if (f.dataset.group) {
    const group = f.dataset.group, draft = {}; collect(f, draft);
    if (await saveSection(f, btn, group, draft[group] || {})) {
      f.outerHTML = groupForm(group); // re-render with what the server actually stored
      toast('Settings saved.');
      if (group === 'general') { applyLogo(); refresh(); }
    }
  } else if (f.id === 'bankForm') {
    readBanks();
    if (await saveSection(f, btn, 'banks', banks)) { banks = (settings.banks || []).map(b => ({ ...b })); bankRows(); toast('Bank details saved.'); }
  } else if (f.id === 'pwForm') {
    const cur = $('#curPw').value, n = $('#newPw').value, local = {};
    if (!cur) local.current_password = 'Enter your current password.';
    else if (n.length < 8) local.new_password = 'Use at least 8 characters.';
    else if (n !== $('#newPw2').value) local.confirm = 'The new passwords do not match.';
    else if (n === cur) local.new_password = 'The new password must be different from the current one.';
    if (Object.keys(local).length) return showFormErrors(f, local);
    showFormErrors(f, {}); setBusy(btn, true, 'Saving...');
    try { await MaisonApi.changePassword(cur, n); f.reset(); toast('Password changed.'); }
    catch (error) {
      if (error.status === 401) return backToLogin();
      showFormErrors(f, error.details, error.message || 'Could not change the password.');
    } finally { setBusy(btn, false); }
  }
});
$('#settingsPanels').addEventListener('click', async e => {
  const pub = e.target.closest('#pwaPublish');
  if (pub) {
    if (!settingsLoaded || pub.dataset.busy) return;
    const form = $('[data-group="pwa"]'), draft = {}; collect(form, draft);
    setBusy(pub, true, 'Publishing...'); $('#pwaRelErr').textContent = '';
    try {
      if (!(await saveSection(form, null, 'pwa', draft.pwa || {}))) return;
      const res = await MaisonApi.releasePwa($('#pwaBump').value);
      settings.pwa = res.pwa || settings.pwa;
      $('[data-group="pwa"]').outerHTML = groupForm('pwa');
      $('#pwaRelease').outerHTML = pwaReleaseHTML();
      toast('Update published. Installed apps will be notified.');
    } catch (error) {
      if (error.status === 401) return backToLogin();
      $('#pwaRelErr').textContent = error.message || 'Could not publish the update.';
    } finally { setBusy(pub, false); }
    return;
  }
  if (e.target.id === 'addBank') {
    if (banks.length >= 10) return toast('You can save up to 10 bank accounts.');
    readBanks(); banks.push({ bank: '', name: '', number: '', active: true }); bankRows();
  }
  const rm = e.target.closest('[data-rmbank]');
  if (rm) { readBanks(); banks.splice(+rm.dataset.rmbank, 1); bankRows(); }
});
bindImages($('#settingsPanels'), file => MaisonApi.uploadSettingsImage(file));

/* ---------- Storefront editor (Home / About / Contact tabs; saved to the database through the API) ---------- */
function sfSchema() {
  const txt = (k, label, o = {}) => ({ k, label, type: 'text', ...o });
  const area = (k, label, o = {}) => ({ k, label, type: 'textarea', ...o });
  const url = (k, label, o = {}) => ({ k, label, type: 'url', ...o });
  const img = (k, label, o = {}) => ({ k, label, type: 'image', ...o });
  const tog = (k, label, o = {}) => ({ k, label, type: 'toggle', ...o });
  const num = (k, label, o = {}) => ({ k, label, type: 'number', ...o });
  const cat = (k, label, o = {}) => ({ k, label, type: 'category', ...o });
  const lst = (k, label, item, o = {}) => ({ k, label, type: 'list', item, ...o });
  const sec = (title, root, fields, hint = '') => ({ title, root, fields, hint });
  const seo = (root) => sec('Page title & search description', root + '.seo', [txt('title', 'Browser / search title', { hint: 'Leave empty to keep the default title.' }), area('description', 'Search description')]);
  const show = tog('visible', 'Show this section');
  const GOLD = 'Gold highlighted word';

  return {
    home: [
      sec('Announcement bar', 'global', [txt('announce', 'Text', { hint: 'Shown above the header on every page. Leave empty to hide the bar.' })], 'The announcement bar, menu, newsletter and footer appear on every page of the store and are edited here.'),
      sec('Header menu', 'global', [lst('nav', 'Menu links', [txt('label', 'Label'), url('url', 'Link')], { max: 8, single: 'Link', itemTitle: 'label', hint: 'Also used by the mobile menu.' })]),
      sec('Hero', 'home.hero', [
        txt('title', 'Headline'), txt('gold', GOLD), area('text', 'Intro text'),
        txt('cta1_text', 'Main button text'), url('cta1_url', 'Main button link'),
        txt('cta2_text', 'Second link text'), url('cta2_url', 'Second link'),
        lst('tiles', 'Hero images (up to 3)', [img('image', 'Image'), txt('alt', 'Image description'), txt('label', 'Caption (optional)'), url('url', 'Link')], { max: 3, single: 'Image', itemTitle: 'alt' })
      ]),
      sec('Signature collection', 'home.collection', [show, txt('title', 'Title'), area('subtitle', 'Subtitle'), cat('category', 'Show products from', { hint: 'A category or sub-category slug, e.g. perfume. Separate several with commas.' }), num('max', 'Number of products')]),
      sec('Shop by category', 'home.categories', [show, lst('items', 'Category tiles', [txt('title', 'Title'), txt('line', 'Short line'), txt('link_text', 'Link text'), url('url', 'Link'), img('image', 'Image')], { max: 6, single: 'Tile', itemTitle: 'title' })]),
      sec('Brand statement', 'home.statement', [show, txt('line1', 'Line 1'), txt('line2', 'Line 2'), txt('gold', GOLD), area('text', 'Paragraph (optional)')]),
      sec('Signature scent', 'home.feature', [
        show, txt('label', 'Small label'), txt('title', 'Product name', { hint: 'The section stays hidden on the store until it has a name.' }), area('text', 'Story'),
        lst('notes', 'Notes', [txt('label', 'Label'), txt('value', 'Value')], { max: 8, single: 'Note', itemTitle: 'label' }),
        txt('price', 'Price text'), txt('button_text', 'Button text'), url('button_url', 'Button link'), img('image', 'Image')
      ]),
      sec('Skincare & makeup', 'home.beauty', [show, txt('title', 'Title'), area('subtitle', 'Subtitle'), cat('category', 'Show products from', { hint: 'Several categories are mixed, e.g. skincare,makeup.' }), num('max', 'Number of products')]),
      sec('Story', 'home.story', [show, txt('title', 'Title'), area('text', 'Text', { hint: 'The section stays hidden on the store until it has text or an image.' }), txt('button_text', 'Button text'), url('button_url', 'Button link'), img('image', 'Image')]),
      sec('Journal', 'home.journal', [show, txt('title', 'Title'), lst('posts', 'Articles', [txt('category', 'Category'), txt('title', 'Title'), txt('date', 'Date'), txt('link_text', 'Link text'), url('url', 'Link'), img('image', 'Image')], { max: 12, single: 'Article', itemTitle: 'title', hint: 'The section is hidden on the store while there are no articles.' })]),
      sec('Newsletter (all pages)', 'global.newsletter', [show, txt('title', 'Title'), area('text', 'Text'), txt('placeholder', 'Email field placeholder'), txt('button', 'Button text'), txt('success', 'Thank-you message'), area('note', 'Small print')]),
      sec('Footer (all pages)', 'global.footer', [
        txt('copyright', 'Copyright line', { hint: 'Use {year} and {name} to insert the year and the store name.' }),
        lst('columns', 'Footer columns', [txt('title', 'Column title'), lst('links', 'Links', [txt('label', 'Label'), url('url', 'Link')], { max: 12, single: 'Link', itemTitle: 'label' })], { max: 6, single: 'Column', itemTitle: 'title' })
      ], 'A link without an address shows "coming soon". Instagram, TikTok, Facebook and X links without an address use the links saved in Settings > Social.'),
      seo('home')
    ],
    about: [
      sec('Philosophy', 'about.philosophy', [show, txt('label', 'Small label'), txt('title', 'Headline', { hint: 'The section stays hidden on the store until it has a headline or text.' }), area('text', 'Text', { hint: 'Leave a blank line between paragraphs.' }), img('image', 'Image')]),
      sec('Values', 'about.values', [show, txt('title', 'Title'), txt('gold', GOLD), area('intro', 'Intro line'), lst('items', 'Values', [txt('title', 'Title'), area('text', 'Description')], { max: 6, single: 'Value', itemTitle: 'title' })]),
      sec('The Maison (craft)', 'about.craft', [show, txt('label', 'Small label'), txt('title', 'Headline', { hint: 'The section stays hidden on the store until it has a headline or text.' }), area('text', 'Text', { hint: 'Leave a blank line between paragraphs.' }), txt('button_text', 'Button text'), url('button_url', 'Button link'), img('image', 'Image')]),
      sec('Call to action', 'about.cta', [show, txt('title', 'Title'), txt('gold', GOLD), area('text', 'Text'), txt('button_text', 'Button text'), url('button_url', 'Button link'), txt('link_text', 'Second link text'), url('link_url', 'Second link')]),
      seo('about')
    ],
    contact: [
      sec('Contact details', 'contact.info', [txt('title', 'Heading'), txt('email_label', 'Email label'), txt('phone_label', 'Phone label'), txt('address_label', 'Address label'), txt('hours_label', 'Hours label'), txt('follow_label', 'Follow label')], 'The email, phone, address, opening hours and social links themselves are edited in Settings (Contact and Social tabs).'),
      sec('Contact form', 'contact.form', [txt('button', 'Button text'), area('note', 'Small print'), lst('topics', 'Topic choices', [txt('label', 'Topic')], { max: 10, single: 'Topic', itemTitle: 'label' })]),
      sec('Frequently asked questions', 'contact.faq', [show, txt('title', 'Title'), lst('items', 'Questions', [txt('q', 'Question'), area('a', 'Answer')], { max: 20, single: 'Question', itemTitle: 'q', hint: 'Questions without an answer are not shown on the store.' })]),
      seo('contact')
    ]
  };
}

const SF_TABS = [['home', 'Home'], ['about', 'About'], ['contact', 'Contact']];
const SF_SCHEMA = sfSchema();
const sfListDefs = {};
Object.values(SF_SCHEMA).forEach(list => list.forEach(s => {
  const reg = (fields, base) => fields.forEach(f => { if (f.type !== 'list') return; const p = base + '.' + f.k; sfListDefs[p] = f; reg(f.item, p); });
  reg(s.fields, s.root);
}));

let sf = null, sfDefaults = null, sfTab = 'home', sfDirty = false, sfLoading = false;
const sfOpen = new Set(['Announcement bar', 'Philosophy', 'Contact details']);

const sfBlank = fields => Object.fromEntries(fields.map(f => [f.k, f.type === 'list' ? [] : f.type === 'toggle' ? true : '']));
const sfId = path => 'sf_' + path.replace(/\./g, '_');

function sfFieldHTML(f, base) {
  const path = base + '.' + f.k, v = getp(sf, path), id = sfId(path);
  const hint = f.hint ? `<p class="hint">${esc(f.hint)}</p>` : '';
  if (f.type === 'list') return `<div class="field sf-wide">${sfListHTML(f, path)}${hint}</div>`;
  if (f.type === 'toggle') return `<div class="field"><label class="switch"><input type="checkbox" id="${id}" data-sf="${path}" ${v ? 'checked' : ''}><span class="knob"></span><span>${esc(f.label)}</span></label>${hint}</div>`;
  if (f.type === 'image') return `<div class="field sf-wide"><label for="${id}">${esc(f.label)}</label><div class="img-row"><img src="${esc(adminAsset(v))}" alt="" ${v ? '' : 'hidden'}><input type="text" id="${id}" data-sf="${path}" value="${esc(v)}" placeholder="Upload, or paste a path or URL"><button type="button" class="btn btn-ghost" data-upload>Upload</button><input type="file" accept="image/jpeg,image/png,image/webp" hidden></div>${hint}</div>`;
  if (f.type === 'textarea') return `<div class="field sf-wide"><label for="${id}">${esc(f.label)}</label><textarea id="${id}" data-sf="${path}" rows="3">${esc(v)}</textarea>${hint}</div>`;
  const attrs = f.type === 'number' ? 'type="number" min="1" max="24"' : f.type === 'category' ? 'type="text" list="sfCats" autocomplete="off"' : f.type === 'url' ? 'type="text" placeholder="shop.html, #story or https://..."' : 'type="text"';
  return `<div class="field"><label for="${id}">${esc(f.label)}</label><input id="${id}" data-sf="${path}" ${attrs} value="${esc(v)}">${hint}</div>`;
}

function sfListHTML(f, path) {
  const arr = getp(sf, path) || [], max = f.max || 24, one = f.single || 'Item';
  const items = arr.map((it, i) => {
    const p = `${path}.${i}`, title = (f.itemTitle && it[f.itemTitle]) || `${one} ${i + 1}`;
    return `<div class="sf-item" data-sf-item="${p}"><div class="sf-item-head"><strong>${esc(title)}</strong><div class="row-btns">`
      + `<button type="button" class="act" data-sf-up="${p}" title="Move up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>`
      + `<button type="button" class="act" data-sf-down="${p}" title="Move down" aria-label="Move down" ${i === arr.length - 1 ? 'disabled' : ''}>&darr;</button>`
      + `<button type="button" class="act danger" data-sf-del="${p}" title="Delete" aria-label="Delete ${esc(title)}">${ICON.trash}</button>`
      + `</div></div><div class="sf-fields">${f.item.map(sub => sfFieldHTML(sub, p)).join('')}</div></div>`;
  }).join('');
  return `<div class="sf-list" data-sf-list="${path}"><p class="sf-list-title">${esc(f.label)} <span class="hint">(${arr.length} of ${max})</span></p>${items || '<p class="hint">Nothing here yet.</p>'}<button type="button" class="btn btn-ghost" data-sf-add="${path}" ${arr.length >= max ? 'disabled' : ''}>Add ${esc(one.toLowerCase())}</button></div>`;
}

function sfSectionHTML(s) {
  return `<details class="grp" data-grp="${esc(s.title)}" ${sfOpen.has(s.title) ? 'open' : ''}><summary>${esc(s.title)}</summary><div class="pform">${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ''}<div class="sf-fields">${s.fields.map(f => sfFieldHTML(f, s.root)).join('')}</div></div></details>`;
}

function sfRenderPanels() {
  $('#sfPanels').innerHTML = SF_TABS.map(([k]) => `<div class="sf-panel" role="tabpanel" id="sfpanel-${k}" aria-labelledby="sftab-${k}" ${k === sfTab ? '' : 'hidden'}>${SF_SCHEMA[k].map(sfSectionHTML).join('')}</div>`).join('');
  $('#sfCats').innerHTML = categories.map(c => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('');
  sfPaintDirty();
}

function sfShowTab(k) {
  sfTab = k;
  $$('#sfTabs [role=tab]').forEach(t => { const on = t.dataset.sftab === k; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  $$('#sfPanels [role=tabpanel]').forEach(p => p.hidden = p.id !== 'sfpanel-' + k);
}

function sfPaintDirty() {
  const d = $('#sfDirty'); if (d) d.textContent = sfDirty ? 'Unsaved changes' : '';
  const b = $('#sfSave'); if (b) b.disabled = !sf;
  const r = $('#sfReset'); if (r) r.disabled = !sf;
}

function sfShowErrors(errors, fallback = '') {
  $$('#sfPanels [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
  const keys = Object.keys(errors || {});
  keys.forEach(k => $(`#sfPanels [data-sf="${k}"]`)?.setAttribute('aria-invalid', 'true'));
  $('#sfErr').textContent = keys.length ? errors[keys[0]] + (keys.length > 1 ? ` (and ${keys.length - 1} more)` : '') : fallback;
  const first = keys.map(k => $(`#sfPanels [data-sf="${k}"]`)).find(Boolean);
  if (first) {
    const panel = first.closest('[role=tabpanel]'); if (panel) sfShowTab(panel.id.replace('sfpanel-', ''));
    const grp = first.closest('details.grp'); if (grp) { grp.open = true; sfOpen.add(grp.dataset.grp); }
    first.focus(); first.scrollIntoView({ block: 'center' });
  }
}

function sfSetState(msg, retry = false, error = false) {
  const box = $('#sfState'); if (!box) return;
  box.hidden = !msg; box.classList.toggle('error', error);
  $('#sfStateText').textContent = msg || '';
  $('#sfRetry').hidden = !retry;
}

async function sfLoad() {
  if (sfLoading || !window.MaisonApi) return;
  sfLoading = true; sfSetState('Loading storefront...');
  const host = $('#sfPanels'); if (host && !sf) host.innerHTML = skGroups(4);
  try {
    const data = await MaisonApi.getStorefront();
    sf = data.storefront; sfDefaults = data.defaults; sfDirty = false;
    sfRenderPanels(); sfSetState('');
  } catch (error) {
    if (error.status === 401) return backToLogin();
    sf = null; sfPaintDirty(); if ($('#sfPanels')) $('#sfPanels').innerHTML = '';
    sfSetState((error.message || 'Could not load the storefront.') + ' Saving is disabled until it loads.', true, true);
  } finally { sfLoading = false; }
}

async function sfSave() {
  if (!sf) return;
  const btn = $('#sfSave');
  sfShowErrors({}); setBusy(btn, true, 'Saving...');
  try {
    const res = await MaisonApi.updateStorefront({ storefront: sf });
    sf = res.storefront; sfDefaults = res.defaults || sfDefaults; sfDirty = false;
    sfRenderPanels(); toast('Storefront saved.');
  } catch (error) {
    if (error.status === 401) return backToLogin();
    sfShowErrors(error.details || {}, error.message || 'Could not save the storefront.');
    toast('The storefront was not saved.');
  } finally { setBusy(btn, false); sfPaintDirty(); }
}

async function sfResetAll() {
  if (!sf || !confirm('Reset the whole storefront (Home, About, Contact, menu and footer) to the defaults? Uploaded storefront images are removed.')) return;
  const btn = $('#sfReset');
  setBusy(btn, true, 'Resetting...');
  try {
    const res = await MaisonApi.resetStorefront();
    sf = res.storefront; sfDefaults = res.defaults || sfDefaults; sfDirty = false;
    sfShowErrors({}); sfRenderPanels(); toast('Storefront reset to the defaults.');
  } catch (error) {
    if (error.status === 401) return backToLogin();
    toast(error.message || 'Could not reset the storefront.');
  } finally { setBusy(btn, false); sfPaintDirty(); }
}

function sfRerenderList(path) {
  const f = sfListDefs[path.replace(/\.\d+/g, '')], wrap = $(`#sfPanels [data-sf-list="${path}"]`);
  if (f && wrap) wrap.outerHTML = sfListHTML(f, path);
}

function sfBind() {
  const root = $('#sfPanels');
  const sync = e => {
    const t = e.target, path = t.dataset && t.dataset.sf;
    if (!path || !sf) return;
    setp(sf, path, t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value);
    sfDirty = true; sfPaintDirty(); t.removeAttribute('aria-invalid');
  };
  root.addEventListener('input', sync);
  root.addEventListener('change', sync);
  root.addEventListener('click', e => {
    if (!sf) return;
    const add = e.target.closest('[data-sf-add]'), del = e.target.closest('[data-sf-del]'), up = e.target.closest('[data-sf-up]'), down = e.target.closest('[data-sf-down]');
    const split = p => [p.replace(/\.\d+$/, ''), +p.split('.').pop()];
    if (add) {
      const path = add.dataset.sfAdd, f = sfListDefs[path.replace(/\.\d+/g, '')];
      if (!f) return;
      let arr = getp(sf, path); if (!Array.isArray(arr)) { setp(sf, path, []); arr = getp(sf, path); }
      if (arr.length >= (f.max || 24)) return;
      arr.push(sfBlank(f.item)); sfDirty = true; sfRerenderList(path); sfPaintDirty();
      $(`#sfPanels [data-sf-item="${path}.${arr.length - 1}"] input:not([type=file]), #sfPanels [data-sf-item="${path}.${arr.length - 1}"] textarea`)?.focus();
    } else if (del) {
      const [lp, i] = split(del.dataset.sfDel), arr = getp(sf, lp);
      if (!Array.isArray(arr)) return;
      arr.splice(i, 1); sfDirty = true; sfRerenderList(lp); sfPaintDirty();
    } else if (up || down) {
      const [lp, i] = split((up || down).dataset[up ? 'sfUp' : 'sfDown']), arr = getp(sf, lp), j = up ? i - 1 : i + 1;
      if (!Array.isArray(arr) || j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]]; sfDirty = true; sfRerenderList(lp); sfPaintDirty();
    }
  });
  root.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.grp')) d.open ? sfOpen.add(d.dataset.grp) : sfOpen.delete(d.dataset.grp); }, true);
  bindImages(root, file => MaisonApi.uploadSettingsImage(file));
}

function showStorefront() {
  const view = $('[data-view="storefront"]');
  if (!view) return;
  if (!$('#sfPanels')) {
    view.innerHTML = `<div class="settings-state" id="sfState" hidden><span id="sfStateText"></span><button type="button" class="btn btn-ghost" id="sfRetry" hidden>Try again</button></div>
      <div class="savebar"><span class="hint" id="sfDirty" role="status"></span><a class="btn btn-ghost" href="../index.html" target="_blank" rel="noopener">View store</a><button type="button" class="btn btn-ghost" id="sfReset" disabled>Reset to defaults</button><button type="button" class="btn" id="sfSave" disabled>Save changes</button></div>
      <p class="err" id="sfErr" role="alert"></p>
      <div class="tabs" role="tablist" id="sfTabs" aria-label="Storefront pages">${SF_TABS.map(([k, l]) => `<button type="button" role="tab" id="sftab-${k}" aria-controls="sfpanel-${k}" aria-selected="${k === sfTab}" tabindex="${k === sfTab ? 0 : -1}" data-sftab="${k}">${l}</button>`).join('')}</div>
      <div id="sfPanels"></div><datalist id="sfCats"></datalist>`;
    $('#sfTabs').addEventListener('click', e => { const t = e.target.closest('[data-sftab]'); if (t) sfShowTab(t.dataset.sftab); });
    $('#sfTabs').addEventListener('keydown', e => {
      const tabs = $$('#sfTabs [role=tab]'), i = tabs.indexOf(document.activeElement);
      if (i < 0 || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); sfShowTab(n.dataset.sftab);
    });
    $('#sfSave').addEventListener('click', sfSave);
    $('#sfReset').addEventListener('click', sfResetAll);
    $('#sfRetry').addEventListener('click', sfLoad);
    sfBind();
  }
  if (!sf) sfLoad();
}
addEventListener('beforeunload', e => { if (sfDirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- Products ---------- */
const KEY = 'ibra_admin_products';
let items = [];
let categories = [];
let productPage = 1;
const PAGE_SIZE = 10;
let apiProductsReady = false;
const saveItems = () => store.set(KEY, items);
const fromApiProduct = p => ({
  id: p.slug,
  apiId: p.id,
  slug: p.slug,
  name: p.name,
  type: p.category?.slug || 'perfume',
  parentSlug: p.category?.parent?.slug || '',
  categoryLabel: p.category?.parent ? `${p.category.parent.name} › ${p.category.name}` : (p.category?.name || ''),
  price: p.price,
  compareAtPrice: p.compare_at_price,
  desc: p.short_description || p.description || '',
  fullDesc: p.full_description || '',
  image: p.image_url || '',
  images: p.images || [],
  stock: Number(p.stock_quantity || 0),
  featured: Boolean(p.featured),
  specs: p.specifications || [],
  createdAt: p.created_at || '',
  updatedAt: p.updated_at || '',
  status: p.status || 'draft'
});
const statusLabel = s => ({ active: 'Active', draft: 'Draft', out_of_stock: 'Out of stock' }[s] || s);
const slugifyText = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
async function loadAdminProducts() {
  if (!window.MaisonApi) return;
  try {
    const catData = await MaisonApi.adminCategories();
    categories = catData.categories || [];
    catsLoaded = true;
    renderCategoryOptions();
    renderCategories();
    const data = await MaisonApi.adminProducts();
    if (Array.isArray(data.products)) {
      items = data.products.map(fromApiProduct);
      apiProductsReady = true;
      refresh();
    }
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      location.replace('../login.html');
      return;
    }
    toast(error.message || 'Could not load the products.');
    tableState('#productRows', 8, error.message || 'Could not load the products.', loadAdminProducts); $('#productsEmpty').hidden = true;
    tableState('#categoryRows', 8, 'Could not load the categories.', loadAdminProducts); $('#categoriesEmpty').hidden = true;
  }
}
function renderCategoryOptions() {
  const byParent = {};
  categories.filter(c => c.parent_id).forEach(c => (byParent[c.parent_id] ||= []).push(c));
  // Products can only be assigned to active categories (the API enforces it); the filter lists everything.
  const build = activeOnly => categories.filter(c => !c.parent_id && (!activeOnly || c.status === 'active')).map(c => [
    `<option value="${esc(c.slug)}">${esc(c.name)}${c.status === 'hidden' ? ' (hidden)' : ''}</option>`,
    ...(byParent[c.id] || []).filter(s => !activeOnly || s.status === 'active').map(s => `<option value="${esc(s.slug)}">${esc(c.name)} › ${esc(s.name)}${s.status === 'hidden' ? ' (hidden)' : ''}</option>`)
  ].join('')).join('');
  const keep = $('#productCategoryFilter').value;
  $('#fType').innerHTML = build(true);
  $('#productCategoryFilter').innerHTML = '<option value="">All categories</option>' + build(false);
  $('#productCategoryFilter').value = keep;
}
function filteredProducts() {
  const q = $('#q').value.trim().toLowerCase();
  const cat = $('#productCategoryFilter').value;
  const status = $('#productStatusFilter').value;
  let list = items.filter(p =>
    (!q || (p.name + ' ' + p.desc + ' ' + p.type).toLowerCase().includes(q)) &&
    (!cat || p.type === cat || p.parentSlug === cat) &&
    (!status || p.status === status)
  );
  const sort = $('#productSort').value;
  list = [...list].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'price-low') return Number(a.price || 0) - Number(b.price || 0);
    if (sort === 'price-high') return Number(b.price || 0) - Number(a.price || 0);
    if (sort === 'stock') return Number(b.stock || 0) - Number(a.stock || 0);
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  return list;
}
function renderProducts() {
  if (!apiProductsReady) return; // the skeleton rows stay until the real list arrives
  const list = filteredProducts();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  productPage = Math.min(productPage, pages);
  const pageItems = list.slice((productPage - 1) * PAGE_SIZE, productPage * PAGE_SIZE);
  $('#productRows').innerHTML = pageItems.map(p => `<tr><td><div class="product-cell"><img src="${esc(p.image)}" alt="" onerror="this.hidden=true"><div><div class="pname">${esc(p.name)}</div><div class="pdesc">${esc(p.desc)}</div></div></div></td><td>${esc(p.categoryLabel || CATS[p.type] || p.type)}</td><td>${fmt(p.price)}${p.compareAtPrice ? `<div class="pdesc">Sale ${fmt(p.compareAtPrice)}</div>` : ''}</td><td>${esc(p.stock)}</td><td><span class="badge ${p.status}">${esc(statusLabel(p.status))}</span></td><td>${p.featured ? 'Yes' : 'No'}</td><td>${esc((p.createdAt || '').slice(0, 10))}</td><td><div class="row-btns"><a class="act" href="../product.html?id=${encodeURIComponent(p.slug || p.id)}" target="_blank" rel="noopener" title="View" aria-label="View ${esc(p.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></a><button class="act" type="button" data-edit="${esc(p.id)}" title="Edit" aria-label="Edit ${esc(p.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/></svg></button><button class="act danger" type="button" data-del="${esc(p.id)}" title="Delete" aria-label="Delete ${esc(p.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div></td></tr>`).join('');
  $('#productsEmpty').hidden = list.length > 0;
  $('#productPager').hidden = list.length <= PAGE_SIZE;
  $('#productPageText').textContent = `Page ${productPage} of ${pages}`;
  $('#prevProducts').disabled = productPage <= 1;
  $('#nextProducts').disabled = productPage >= pages;
}
const dlg = $('#productDialog'), form = $('#productForm');
const el = n => form.elements.namedItem(n); // form.name / form.id would return the <form>'s own attributes
let currentImages = [];
function specRow(spec = {}) {
  return `<div class="spec-row"><input data-spec-key value="${esc(spec.key || '')}" placeholder="Spec name"><input data-spec-value value="${esc(spec.value || '')}" placeholder="Value"><button type="button" class="link-btn del" data-rmspec>Remove</button></div>`;
}
function renderSpecs(specs = []) {
  $('#specList').innerHTML = (specs.length ? specs : [{}]).map(specRow).join('');
}
function renderImagePreviews(p) {
  $('#coverPreview').innerHTML = p?.image ? `<div class="preview-item"><img src="${esc(p.image)}" alt=""><span>Current cover</span></div>` : '';
  currentImages = (p?.images || []).map(img => ({ ...img, keep: true }));
  $('#additionalPreview').innerHTML = currentImages.map(img => `<div class="preview-item" data-image-id="${img.id}"><img src="${esc(img.url || img.image_url)}" alt=""><button type="button" class="link-btn del" data-remove-image="${img.id}">Remove</button></div>`).join('');
  el('keep_image_ids').value = currentImages.filter(i => i.keep).map(i => i.id).join(',');
}
function previewFiles(input, host, append = false) {
  const files = [...input.files].slice(0, 3);
  const html = files.map(file => `<div class="preview-item"><img src="${esc(URL.createObjectURL(file))}" alt=""><span>${esc(file.name)}</span></div>`).join('');
  host.innerHTML = append ? host.innerHTML + html : html;
}
function openDialog(p) {
  form.reset(); $('#productErr').textContent = ''; el('name').removeAttribute('aria-invalid');
  $('#dlgTitle').textContent = p ? 'Edit product' : 'Add product'; el('id').value = p?.id || '';
  if (p) {
    // A product whose category is now hidden is not in the active-only list: show it so saving never moves it silently.
    if (![...el('category_slug').options].some(o => o.value === p.type)) el('category_slug').insertAdjacentHTML('afterbegin', `<option value="${esc(p.type)}">${esc(p.categoryLabel || p.type)} (hidden)</option>`);
    el('name').value = p.name; el('slug').value = p.slug || p.id; el('category_slug').value = p.type;
    el('price').value = p.price ?? ''; el('compare_at_price').value = p.compareAtPrice ?? '';
    el('stock_quantity').value = p.stock ?? 0; el('short_description').value = p.desc || '';
    el('full_description').value = p.fullDesc || ''; el('status').value = p.status;
    el('featured').checked = p.featured;
  }
  renderSpecs(p?.specs || []);
  renderImagePreviews(p);
  dlg.showModal(); el('name').focus();
}
$('#addBtn').addEventListener('click', () => openDialog());
$('#quickAdd').addEventListener('click', () => { location.hash = '#products'; openDialog(); });
$('#cancelBtn').addEventListener('click', () => dlg.close());
el('name').addEventListener('input', () => { if (!el('id').value || !el('slug').value) el('slug').value = slugifyText(el('name').value); });
$('#addSpec').addEventListener('click', () => $('#specList').insertAdjacentHTML('beforeend', specRow()));
$('#specList').addEventListener('click', e => { if (e.target.closest('[data-rmspec]')) e.target.closest('.spec-row').remove(); });
$('#additionalPreview').addEventListener('click', e => {
  const btn = e.target.closest('[data-remove-image]');
  if (!btn) return;
  currentImages = currentImages.map(img => img.id === +btn.dataset.removeImage ? { ...img, keep: false } : img);
  el('keep_image_ids').value = currentImages.filter(i => i.keep).map(i => i.id).join(',');
  btn.closest('.preview-item').remove();
});
$('#fCover').addEventListener('change', e => previewFiles(e.target, $('#coverPreview')));
$('#fAdditional').addEventListener('change', e => {
  const kept = currentImages.filter(i => i.keep).length;
  if (kept + e.target.files.length > 3) { e.target.value = ''; return $('#productErr').textContent = 'Only three additional images are allowed.'; }
  previewFiles(e.target, $('#additionalPreview'), true);
});
form.addEventListener('submit', async e => {
  e.preventDefault();
  const name = el('name').value.trim();
  const id = el('id').value, existing = items.find(p => p.id === id);
  $('#productErr').textContent = '';
  if (!name) { el('name').setAttribute('aria-invalid', 'true'); $('#productErr').textContent = 'Enter a product name.'; return el('name').focus(); }
  if (!id && !el('cover_image').files[0]) return $('#productErr').textContent = 'Product cover image is required.';
  const saveBtn = form.querySelector('button[type=submit]');
  if (saveBtn.dataset.busy) return;
  setBusy(saveBtn, true, 'Saving...');
  const formData = new FormData(form);
  const specs = $$('.spec-row').map(row => ({ key: row.querySelector('[data-spec-key]').value.trim(), value: row.querySelector('[data-spec-value]').value.trim() })).filter(s => s.key && s.value);
  formData.set('specifications', JSON.stringify(specs));
  try {
    if (window.MaisonApi && apiProductsReady) {
      if (id) {
        formData.set('_method', 'PUT');
        await MaisonApi.updateProduct(existing.apiId, formData);
        toast('Product updated.');
      } else {
        await MaisonApi.createProduct(formData);
        toast('Product added.');
      }
      await loadAdminProducts();
    } else throw new Error('API product management is not available.');
    dlg.close();
  } catch (error) {
    const d = error.details || {};
    $('#productErr').textContent = d.name || d.slug || d.cover_image || d.short_description || d.full_description || d.price || d.compare_at_price || d.stock_quantity || d.additional_images || error.message || 'Could not save product.';
  } finally { setBusy(saveBtn, false); }
});
$('#productRows').addEventListener('click', e => {
  const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (ed) openDialog(items.find(p => p.id === ed.dataset.edit));
  if (del && confirm('Delete this product? This cannot be undone.')) {
    const existing = items.find(p => p.id === del.dataset.del);
    if (window.MaisonApi && apiProductsReady && existing?.apiId) {
      const fd = new FormData(); fd.set('_method', 'DELETE');
      MaisonApi.updateProduct(existing.apiId, fd).then(loadAdminProducts).then(() => toast('Product deleted.')).catch(error => toast(error.message || 'Could not delete product.'));
    } else {
      items = items.filter(p => p.id !== del.dataset.del); saveItems(); refresh(); toast('Product deleted.');
    }
  }
});
$('#q').addEventListener('input', () => { productPage = 1; renderProducts(); });
$('#productCategoryFilter').addEventListener('change', () => { productPage = 1; renderProducts(); });
$('#productStatusFilter').addEventListener('change', () => { productPage = 1; renderProducts(); });
$('#productSort').addEventListener('change', renderProducts);
$('#prevProducts').addEventListener('click', () => { productPage--; renderProducts(); });
$('#nextProducts').addEventListener('click', () => { productPage++; renderProducts(); });
$('#exportBtn').addEventListener('click', () => download('products.json', JSON.stringify(items, null, 2), 'application/json'));
function download(name, text, type) { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name }); a.click(); URL.revokeObjectURL(a.href); }

/* ---------- Categories & sub-categories ---------- */
const catDlg = $('#categoryDialog'), catForm = $('#categoryForm'), cel = n => catForm.elements.namedItem(n);
const delDlg = $('#catDelDialog');
let catSlugTouched = false, delState = null;
const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'
};
const catLabel = c => c.parent_id ? `${c.parent_name} › ${c.name}` : c.name;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function categoryRowHTML(c) {
  const sub = !!c.parent_id;
  const addSub = sub ? '<span class="act-spacer"></span>' : `<button class="act" type="button" data-cat-addsub="${c.id}" title="Add sub-category" aria-label="Add sub-category to ${esc(c.name)}">${ICON.plus}</button>`;
  const del = c.is_protected
    ? `<button class="act danger" type="button" disabled title="Core category: it powers the storefront pages. Hide it instead." aria-label="${esc(c.name)} cannot be deleted">${ICON.trash}</button>`
    : `<button class="act danger" type="button" data-cat-del="${c.id}" title="Delete" aria-label="Delete ${esc(c.name)}">${ICON.trash}</button>`;
  return `<tr class="${sub ? 'cat-sub' : ''}"><td><div class="pname">${esc(c.name)}</div>${c.description ? `<div class="pdesc">${esc(c.description)}</div>` : ''}</td><td><span class="cat-slug">${esc(c.slug)}</span></td><td>${sub ? esc(c.parent_name) : 'Top-level'}</td><td>${esc(c.product_count)}</td><td>${sub ? '—' : esc(c.child_count)}</td><td><span class="badge ${c.status === 'hidden' ? 'draft' : ''}">${c.status === 'hidden' ? 'Hidden' : 'Active'}</span></td><td>${esc(c.sort_order)}</td><td><div class="row-btns">${addSub}<button class="act" type="button" data-cat-edit="${c.id}" title="Edit" aria-label="Edit ${esc(c.name)}">${ICON.edit}</button>${del}</div></td></tr>`;
}
function renderCategories() {
  if (!catsLoaded) return;
  const q = $('#catSearch').value.trim().toLowerCase(), st = $('#catStatusFilter').value;
  const nameHit = c => !q || `${c.name} ${c.slug}`.toLowerCase().includes(q), statHit = c => !st || c.status === st;
  const rows = [];
  categories.filter(c => !c.parent_id).forEach(t => {
    // A parent is shown when it matches, or when one of its sub-categories does (as context).
    const kids = categories.filter(c => c.parent_id === t.id && statHit(c) && (nameHit(c) || nameHit(t)));
    if ((nameHit(t) && statHit(t)) || kids.length) rows.push(t, ...kids);
  });
  $('#categoryRows').innerHTML = rows.map(categoryRowHTML).join('');
  $('#categoriesEmpty').hidden = rows.length > 0;
}
function markCategoryErrors(errors, fallback = '') {
  $$('[aria-invalid]', catForm).forEach(x => x.removeAttribute('aria-invalid'));
  const keys = Object.keys(errors || {});
  keys.forEach(k => cel(k)?.setAttribute('aria-invalid', 'true'));
  $('#categoryErr').textContent = keys.length ? errors[keys[0]] : fallback;
  if (keys.length) cel(keys[0])?.focus();
}
function openCategoryDialog(c, parentId = null) {
  catForm.reset(); markCategoryErrors({});
  catSlugTouched = !!c;
  $('#catDlgTitle').textContent = c ? 'Edit category' : parentId ? 'Add sub-category' : 'Add category';
  cel('id').value = c?.id || '';
  const tops = categories.filter(x => !x.parent_id && x.id !== c?.id);
  $('#cParent').innerHTML = '<option value="">None (top-level category)</option>' + tops.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  if (c) {
    cel('name').value = c.name; cel('slug').value = c.slug; cel('description').value = c.description || '';
    cel('sort_order').value = c.sort_order; cel('status').value = c.status; cel('parent_id').value = c.parent_id || '';
  } else if (parentId) cel('parent_id').value = parentId;
  const lockParent = !!c && (c.is_protected || c.child_count > 0);
  cel('parent_id').disabled = lockParent;
  $('#cParentHint').textContent = lockParent
    ? (c.is_protected ? 'Core categories always stay top-level.' : 'This category has sub-categories, so it must stay top-level.')
    : 'Leave as top-level, or pick a parent to create a sub-category.';
  cel('slug').readOnly = !!c?.is_protected;
  $('#cSlugHint').textContent = c?.is_protected ? 'The slug of a core category is used by the storefront and cannot be changed.' : 'Used in storefront links. Lowercase letters, numbers and hyphens.';
  catDlg.showModal(); cel('name').focus();
}
cel('name').addEventListener('input', () => { if (!catSlugTouched) cel('slug').value = slugifyText(cel('name').value); });
cel('slug').addEventListener('input', () => { catSlugTouched = true; });
$('#addCategoryBtn').addEventListener('click', () => openCategoryDialog());
$('#catCancel').addEventListener('click', () => catDlg.close());
catForm.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#catSave'), id = cel('id').value;
  const body = { name: cel('name').value.trim(), slug: cel('slug').value.trim(), parent_id: cel('parent_id').value || null, description: cel('description').value.trim(), sort_order: cel('sort_order').value.trim(), status: cel('status').value };
  const local = {};
  if (!body.name) local.name = 'Enter a category name.';
  if (body.slug && !/^[a-z0-9-]+$/.test(body.slug)) local.slug = 'Slug may only contain lowercase letters, numbers and hyphens.';
  if (body.sort_order !== '' && !/^\d{1,4}$/.test(body.sort_order)) local.sort_order = 'Display order must be a whole number from 0 to 9999.';
  if (Object.keys(local).length) return markCategoryErrors(local);
  markCategoryErrors({});
  if (!window.MaisonApi) return markCategoryErrors({}, 'The API is not available.');
  setBusy(btn, true, 'Saving...');
  try {
    if (id) await MaisonApi.updateCategory(id, body); else await MaisonApi.createCategory(body);
    catDlg.close(); toast(id ? 'Category updated.' : 'Category added.');
    await loadAdminProducts(); // refreshes categories, the product form options and product labels
  } catch (error) {
    if (error.status === 401) return backToLogin();
    markCategoryErrors(error.details, error.message || 'Could not save the category.');
  } finally { setBusy(btn, false); }
});

function setupDeleteDialog(c) {
  const msg = $('#catDelMsg'), move = $('#catDelMoveField'), ok = $('#catDelConfirm'), sel = $('#catDelTarget');
  $('#catDelErr').textContent = ''; $('#catDelTitle').textContent = `Delete “${c.name}”`;
  move.hidden = true; ok.hidden = false; ok.textContent = 'Delete';
  if (c.child_count > 0) {
    msg.textContent = `“${c.name}” still has ${plural(c.child_count, 'sub-category', 'sub-categories')}. Delete or move them first.`; ok.hidden = true;
  } else if (c.product_count > 0) {
    const targets = categories.filter(x => x.id !== c.id && x.status === 'active');
    if (!targets.length) { msg.textContent = `${plural(c.product_count, 'product uses', 'products use')} “${c.name}”, and there is no other active category to move them to. Create one first.`; ok.hidden = true; return; }
    msg.textContent = `${plural(c.product_count, 'product uses', 'products use')} “${c.name}”. Choose where they should go; the category is then deleted. This cannot be undone.`;
    sel.innerHTML = targets.map(t => `<option value="${t.id}">${esc(catLabel(t))}</option>`).join('');
    if (c.parent_id && targets.some(t => t.id === c.parent_id)) sel.value = c.parent_id;
    move.hidden = false; ok.textContent = 'Move products & delete';
  } else msg.textContent = `Delete “${c.name}”? This cannot be undone.`;
}
function openDeleteDialog(c) { delState = c; setupDeleteDialog(c); if (!delDlg.open) delDlg.showModal(); }
$('#catDelCancel').addEventListener('click', () => delDlg.close());
$('#catDelForm').addEventListener('submit', async e => {
  e.preventDefault();
  const c = delState, btn = $('#catDelConfirm'), err = $('#catDelErr');
  if (!c || !window.MaisonApi) return;
  const moving = !$('#catDelMoveField').hidden, target = moving ? Number($('#catDelTarget').value) || null : null;
  if (moving && !target) return err.textContent = 'Choose a category to move the products to.';
  err.textContent = ''; setBusy(btn, true, 'Deleting...');
  try {
    await MaisonApi.deleteCategory(c.id, target);
    delDlg.close(); delState = null;
    toast(moving ? 'Products moved and category deleted.' : 'Category deleted.');
    await loadAdminProducts();
  } catch (error) {
    if (error.status === 401) return backToLogin();
    const d = error.details || {};
    if (error.status === 409 && (d.product_count || d.child_count)) { // our list was stale: show what the server found
      if (d.product_count) c.product_count = d.product_count;
      if (d.child_count) c.child_count = d.child_count;
      setupDeleteDialog(c); err.textContent = error.message;
    } else err.textContent = d.reassign_to || error.message || 'Could not delete the category.';
  } finally { setBusy(btn, false); }
});

$('#categoryRows').addEventListener('click', e => {
  const byId = id => categories.find(c => c.id === +id);
  const ed = e.target.closest('[data-cat-edit]'), del = e.target.closest('[data-cat-del]'), add = e.target.closest('[data-cat-addsub]');
  if (ed) openCategoryDialog(byId(ed.dataset.catEdit));
  if (add) openCategoryDialog(null, +add.dataset.catAddsub);
  if (del) openDeleteDialog(byId(del.dataset.catDel));
});
$('#catSearch').addEventListener('input', renderCategories);
$('#catStatusFilter').addEventListener('change', renderCategories);

/* ---------- Customers (registered accounts, from the API) ---------- */
const CU_PAGE = 20;
let cuPage = 1, cuSeq = 0, cuTimer, cuOpen = null;
const cuDate = s => String(s || '').slice(0, 10) || '—';
const cuBadge = s => `<span class="badge ${s === 'disabled' ? 'out_of_stock' : ''}">${s === 'disabled' ? 'Disabled' : 'Active'}</span>`;
function paintCustomerSummary() {
  $('#cuTotal').textContent = customerSummary.total; $('#cuActive').textContent = customerSummary.active; $('#cuDisabled').textContent = customerSummary.disabled;
  $('#sCustomers').textContent = customerSummary.total;
}
async function loadCustomers() {
  if (!window.MaisonApi) return;
  const seq = ++cuSeq;
  try {
    const params = { page: cuPage, per_page: CU_PAGE };
    const q = $('#cuSearch').value.trim(), st = $('#cuStatus').value;
    if (q) params.q = q; if (st) params.status = st;
    const data = await MaisonApi.adminCustomers(params);
    if (seq !== cuSeq) return; // a newer search replaced this request
    const pg = data.pagination; cuPage = pg.page;
    Object.assign(customerSummary, data.summary);
    customersLoaded = true;
    paintCustomerSummary();
    $('#customerRows').innerHTML = data.customers.map(c => `<tr><td><div class="pname">${esc(c.name)}</div><div class="pdesc">${esc(c.email)}</div></td><td>${esc(c.phone || '—')}</td><td>${esc(c.order_count)}</td><td>${fmt(c.total_spent)}</td><td>${esc(cuDate(c.last_order_at))}</td><td>${esc(cuDate(c.created_at))}</td><td>${cuBadge(c.status)}</td><td><div class="row-btns"><button class="act" type="button" data-cu-view="${c.id}" title="View" aria-label="View ${esc(c.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div></td></tr>`).join('');
    $('#customersEmpty').hidden = data.customers.length > 0;
    $('#customerPager').hidden = pg.total_pages <= 1;
    $('#customerPageText').textContent = `Page ${pg.page} of ${pg.total_pages} (${pg.total} customers)`;
    $('#prevCustomers').disabled = pg.page <= 1; $('#nextCustomers').disabled = pg.page >= pg.total_pages;
  } catch (error) {
    if (seq !== cuSeq) return;
    if (error.status === 401) return backToLogin();
    toast(error.message || 'Could not load customers.');
    tableState('#customerRows', 8, error.message || 'Could not load customers.', loadCustomers); $('#customersEmpty').hidden = true;
  }
}
$('#cuSearch').addEventListener('input', () => { clearTimeout(cuTimer); cuTimer = setTimeout(() => { cuPage = 1; loadCustomers(); }, 300); });
$('#cuStatus').addEventListener('change', () => { cuPage = 1; loadCustomers(); });
$('#prevCustomers').addEventListener('click', () => { cuPage--; loadCustomers(); });
$('#nextCustomers').addEventListener('click', () => { cuPage++; loadCustomers(); });

const cuDlg = $('#customerDialog');
function paintCustomerDialog(c) {
  cuOpen = c;
  $('#cuDlgTitle').textContent = c.name;
  $('#cuFacts').innerHTML = [['Email', c.email], ['Phone', c.phone || '—'], ['Status', null], ['Joined', cuDate(c.created_at)], ['Orders', c.order_count], ['Total spent', fmt(c.total_spent)], ['Last order', cuDate(c.last_order_at)]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v === null ? cuBadge(c.status) : esc(v)}</dd></div>`).join('');
  $('#cuOrders').innerHTML = (c.orders || []).map(o => `<tr><td><strong>${esc(o.order_number)}</strong></td><td>${esc(cuDate(o.created_at))}</td><td>${esc(o.item_count)}</td><td>${fmt(o.total)}</td><td>${esc(o.payment_status)}</td><td>${esc(o.fulfillment_status)}</td></tr>`).join('');
  $('#cuOrdersEmpty').hidden = (c.orders || []).length > 0;
  paintCustomerToggle();
}
function paintCustomerToggle() {
  const off = cuOpen?.status === 'disabled', btn = $('#cuToggle');
  btn.textContent = off ? 'Enable customer' : 'Disable customer';
  btn.classList.toggle('danger', !off);
}
$('#customerRows').addEventListener('click', async e => {
  const b = e.target.closest('[data-cu-view]'); if (!b) return;
  $('#cuErr').textContent = '';
  try {
    const data = await MaisonApi.adminCustomer(b.dataset.cuView);
    paintCustomerDialog(data.customer); cuDlg.showModal();
  } catch (error) { if (error.status === 401) return backToLogin(); toast(error.message || 'Could not load the customer.'); }
});
$('#cuClose').addEventListener('click', () => cuDlg.close());
$('#cuToggle').addEventListener('click', async () => {
  if (!cuOpen) return;
  const next = cuOpen.status === 'disabled' ? 'active' : 'disabled', btn = $('#cuToggle');
  if (next === 'disabled' && !confirm(`Disable ${cuOpen.name}? They will be signed out and unable to sign in until you enable them again.`)) return;
  $('#cuErr').textContent = ''; setBusy(btn, true, 'Saving...');
  try {
    const res = await MaisonApi.updateCustomer(cuOpen.id, { status: next });
    paintCustomerDialog({ ...cuOpen, ...res.customer, orders: cuOpen.orders });
    toast(next === 'disabled' ? 'Customer disabled.' : 'Customer enabled.');
    loadCustomers();
  } catch (error) {
    if (error.status === 401) return backToLogin();
    $('#cuErr').textContent = (error.details && error.details.status) || error.message || 'Could not update the customer.';
  } finally { setBusy(btn, false); paintCustomerToggle(); } // setBusy restores the pre-request label, so repaint it from the current status
});

/* ---------- Orders, customers, dashboard ---------- */
const orderRow = o => `<tr><td>${esc(o.id)}</td><td>${esc(o.customer)}</td><td>${esc(o.date)}</td><td>${fmt(o.total)}</td><td>${esc(o.status)}</td></tr>`;
const PAY = ['pending', 'paid', 'failed', 'refunded'], FUL = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];
const opts = (list, cur) => list.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('');
const orderAdminRow = o => {
  const locked = o.fulfilment === 'cancelled';
  return `<tr><td><strong>${esc(o.id)}</strong></td><td><div class="pname">${esc(o.customer)}</div><div class="pdesc">${esc(o.email)}${o.phone ? ' · ' + esc(o.phone) : ''}</div></td><td>${esc(o.date)}</td><td>${fmt(o.total)}</td>`
    + `<td><select data-order-pay="${o.dbId}" aria-label="Payment status for ${esc(o.id)}" ${locked ? 'disabled' : ''}>${opts(PAY, o.payment)}</select></td>`
    + `<td><select data-order-ful="${o.dbId}" aria-label="Fulfilment status for ${esc(o.id)}" ${locked ? 'disabled' : ''}>${opts(FUL, o.fulfilment)}</select></td>`
    + `<td>${o.receipt ? `<a class="link-btn" href="${esc(MaisonApi.orderReceiptUrl(o.dbId))}" target="_blank" rel="noopener">View</a>` : '<span class="pdesc">None</span>'}</td></tr>`;
};
async function loadOrders() {
  if (!window.MaisonApi) return;
  try {
    const data = await MaisonApi.adminOrders();
    ORDERS.length = 0;
    (data.orders || []).forEach(o => ORDERS.push({
      id: o.order_number, dbId: o.id, customer: o.customer_name, email: o.customer_email, phone: o.customer_phone || '', date: String(o.created_at || '').slice(0, 10), total: o.total,
      payment: o.payment_status, fulfilment: o.fulfillment_status, receipt: o.has_receipt,
      // single status used by the Account report: cancelled / pending (awaiting payment verification) / failed / refunded / else the fulfilment stage
      status: o.fulfillment_status === 'cancelled' ? 'cancelled' : o.payment_status === 'paid' ? o.fulfillment_status : o.payment_status
    }));
    ordersLoaded = true;
    refresh();
  } catch (error) {
    if (error.status === 401) return backToLogin();
    toast(error.message || 'Could not load orders.');
    tableState('#orderRows', 7, error.message || 'Could not load orders.', loadOrders); $('#ordersEmpty').hidden = true;
  }
}
$('#orderRows').addEventListener('change', async e => {
  const pay = e.target.closest('[data-order-pay]'), ful = e.target.closest('[data-order-ful]');
  if (!pay && !ful) return;
  const sel = pay || ful;
  sel.disabled = true;
  try {
    await MaisonApi.updateOrder(pay ? pay.dataset.orderPay : ful.dataset.orderFul, pay ? { payment_status: sel.value } : { fulfillment_status: sel.value });
    toast('Order updated.');
  } catch (error) { toast(error.message || 'Could not update the order.'); }
  await loadOrders(); // re-render with what the server stored (also resets the select after a refusal)
});
function renderTables() {
  if (!ordersLoaded) return;
  $('#orderRows').innerHTML = ORDERS.map(orderAdminRow).join(''); $('#ordersEmpty').hidden = ORDERS.length > 0;
}
function renderStats() {
  if (apiProductsReady) { skClear('#sProducts'); skClear('#sActive'); }
  if (ordersLoaded) skClear('#sOrders');
  if (customersLoaded) skClear('#sCustomers');
  $('#sProducts').textContent = items.length; $('#sActive').textContent = items.filter(p => p.status === 'active').length;
  $('#sOrders').textContent = ORDERS.length; $('#sCustomers').textContent = customerSummary.total;
}
const refresh = () => { renderStats(); renderProducts(); renderTables(); };

/* ---------- Account (date-range report) ---------- */
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const daysAgo = n => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() - n); };
const RANGES = { today: () => [ymd(daysAgo(0)), ymd(daysAgo(0))], 7: () => [ymd(daysAgo(6)), ymd(daysAgo(0))], 30: () => [ymd(daysAgo(29)), ymd(daysAgo(0))], month: () => { const t = new Date(); return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)]; }, all: () => ['', ''] };
let acctList = [];
function renderAccount() {
  const r = $('#range').value, custom = r === 'custom';
  $('#from').disabled = $('#to').disabled = !custom;
  if (!custom) { const [a, b] = RANGES[r](); $('#from').value = a; $('#to').value = b; }
  const from = $('#from').value, to = $('#to').value;
  acctList = ORDERS.filter(o => (!from || o.date >= from) && (!to || o.date <= to));
  const valid = acctList.filter(o => !['cancelled', 'pending', 'failed', 'refunded'].includes(o.status)), rev = valid.reduce((s, o) => s + (+o.total || 0), 0);
  $('#aRevenue').textContent = fmt(rev); $('#aOrders').textContent = acctList.length;
  $('#aAvg').textContent = valid.length ? fmt(Math.round(rev / valid.length)) : '—';
  $('#aCustomers').textContent = new Set(acctList.map(o => o.customer)).size;
  const span = from && to ? (new Date(to) - new Date(from)) / 864e5 : 999, monthly = span > 62, groups = {};
  valid.forEach(o => { const k = monthly ? o.date.slice(0, 7) : o.date; groups[k] = (groups[k] || 0) + (+o.total || 0); });
  const keys = Object.keys(groups).sort(), max = Math.max(...Object.values(groups), 1), chart = $('#chart');
  chart.innerHTML = keys.length ? keys.map(k => `<div class="bar-col" title="${esc(k)}: ${fmt(groups[k])}"><span class="bar" data-h="${groups[k] / max * 100}"></span>${esc(monthly ? k : k.slice(5))}</div>`).join('') : '<p class="empty">No revenue in this period.</p>';
  $$('.bar', chart).forEach(b => b.style.height = b.dataset.h + '%');
  const by = {}; acctList.forEach(o => by[o.status] = (by[o.status] || 0) + 1);
  $('#statusLine').textContent = Object.keys(by).length ? 'By status: ' + Object.entries(by).map(([s, n]) => `${s} ${n}`).join(' · ') : '';
  $('#acctRows').innerHTML = acctList.map(orderRow).join(''); $('#acctEmpty').hidden = acctList.length > 0;
}
$('#range').addEventListener('change', renderAccount);
$('#from').addEventListener('change', renderAccount); $('#to').addEventListener('change', renderAccount);
$('#csvBtn').addEventListener('click', () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  download('orders.csv', ['Order,Customer,Date,Total,Status', ...acctList.map(o => [o.id, o.customer, o.date, o.total, o.status].map(q).join(','))].join('\n'), 'text/csv');
});

renderSettings(); setSettingsState('info', 'Loading settings...'); refresh(); applyLogo(); route();
// Until the API answers: shimmer on the counters and table rows instead of zeros and "nothing here" messages.
['#sProducts', '#sActive', '#sOrders', '#sCustomers'].forEach(id => $(id) && $(id).classList.add('sk', 'sk-inline'));
[['#productRows', 8, '#productsEmpty'], ['#orderRows', 7, '#ordersEmpty'], ['#customerRows', 8, '#customersEmpty'], ['#categoryRows', 8, '#categoriesEmpty']].forEach(([b, c, em]) => { if ($(b)) { $(b).innerHTML = skRows(c); $(b).setAttribute('aria-busy', 'true'); } if ($(em)) $(em).hidden = true; });
ensureAdminSession().then(() => Promise.all([loadSettings(), loadAdminProducts(), loadOrders(), loadCustomers()])).catch(error => {
  if (error && error.status === 401) return backToLogin();
  toast((error && error.message) || 'Could not reach the server. Refresh to try again.');
});
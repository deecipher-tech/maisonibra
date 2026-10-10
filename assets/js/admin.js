/* Admin dashboard (front-end only). Data lives in this browser's localStorage under ibra_* keys.
   TODO: replace store.get/store.set with calls to your backend. A real admin also needs server-side login. */
if (!sessionStorage.getItem(SESSION_KEY)) location.replace('../login.html');

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

let settings = store.get('ibra_settings', {}), site = store.get('ibra_site', {});
const cur = () => settings.general?.currency || '₦';
const fmt = n => n == null || n === '' ? '—' : cur() + Number(n).toLocaleString('en-NG');
const CATS = { perfume: 'Perfume', skincare: 'Skincare', makeup: 'Makeup' };
const ORDERS = store.get('ibra_orders', []);       // { id, customer, date:'YYYY-MM-DD', total, status }
const CUSTOMERS = store.get('ibra_customers', []); // { name, email, orders }

/* ---------- Navigation ---------- */
const TITLES = { dashboard: 'Dashboard', products: 'Products', orders: 'Orders', customers: 'Customers', account: 'Account', storefront: 'Storefront', settings: 'Settings' };
const side = $('#side'), scrim = $('#scrim'), burger = $('#burger');
function setSide(open) { side.classList.toggle('open', open); scrim.hidden = !open; burger.setAttribute('aria-expanded', open); }
function route() {
  const v = TITLES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  $$('[data-view]').forEach(s => s.hidden = s.dataset.view !== v);
  $$('[data-nav]').forEach(a => a.dataset.nav === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  $('#viewTitle').textContent = TITLES[v];
  document.title = `${TITLES[v]} | MAISON IBRA Admin`;
  if (v === 'account') renderAccount();
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
  const src = settings.general?.logo || '../assets/images/logo.png';
  if (img.getAttribute('src') !== src) img.src = src; else if (img.complete && !img.naturalWidth) img.onerror();
}
$('#logout').addEventListener('click', async e => {
  e.preventDefault();
  try { if (window.MaisonApi) await MaisonApi.logout(); } catch (error) {}
  sessionStorage.removeItem(SESSION_KEY);
  location.replace('../login.html');
});
async function ensureAdminSession() {
  if (!window.MaisonApi) return;
  const data = await MaisonApi.me();
  if (data.account?.type !== 'admin') {
    sessionStorage.removeItem(SESSION_KEY);
    location.replace('../login.html');
  }
}

/* ---------- Generic form fields (settings + storefront) ---------- */
const T = (k, label, o = {}) => ({ k, label, ...o });
function fieldHTML(f, obj) {
  const v = getp(obj, f.k) ?? f.d ?? '', id = 'f_' + f.k.replace(/\./g, '_'), p = `data-path="${f.k}"`;
  if (f.type === 'toggle') return `<div class="field"><label class="switch"><input type="checkbox" id="${id}" ${p} ${v === 'on' ? 'checked' : ''}><span class="knob"></span><span>${esc(f.label)}</span></label>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}</div>`;
  if (f.type === 'image') return `<div class="field"><label for="${id}">${esc(f.label)}</label><div class="img-row"><img src="${esc(v)}" alt="" ${v ? '' : 'hidden'}><input type="text" id="${id}" ${p} value="${esc(v)}" placeholder="Path, URL or upload" /><button type="button" class="btn btn-ghost" data-upload>Upload</button><input type="file" accept="image/*" hidden></div></div>`;
  const input = f.type === 'textarea' ? `<textarea id="${id}" ${p} rows="3">${esc(v)}</textarea>` : `<input id="${id}" ${p} type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(v)}" ${f.type === 'number' ? 'min="1" max="24"' : ''}>`;
  return `<div class="field"><label for="${id}">${esc(f.label)}</label>${input}</div>`;
}
function bindImages(root) {
  root.addEventListener('click', e => { const b = e.target.closest('[data-upload]'); if (b) b.parentElement.querySelector('input[type=file]').click(); });
  root.addEventListener('change', e => {
    if (e.target.type !== 'file' || !e.target.files[0]) return;
    const file = e.target.files[0], row = e.target.parentElement;
    if (file.size > 600 * 1024) { e.target.value = ''; return toast('Image is over 600KB. Use a smaller image or a file path.'); }
    const r = new FileReader();
    r.onload = () => { const t = row.querySelector('input[type=text]'); t.value = r.result; row.querySelector('img').src = r.result; row.querySelector('img').hidden = false; };
    r.readAsDataURL(file);
  });
  root.addEventListener('input', e => { if (e.target.type === 'text' && e.target.parentElement.classList.contains('img-row')) { const i = e.target.parentElement.querySelector('img'); i.src = e.target.value; i.hidden = !e.target.value; } });
}
function collect(root, obj) {
  $$('[data-path]', root).forEach(el => setp(obj, el.dataset.path, el.type === 'checkbox' ? (el.checked ? 'on' : 'off') : el.type === 'number' ? Math.max(1, Math.min(24, +el.value || 1)) : el.value.trim()));
  return obj;
}

/* ---------- Settings ---------- */
const SETTINGS = {
  general: [T('general.appName', 'App name', { d: 'MAISON IBRA' }), T('general.currency', 'Currency symbol', { d: '₦' }), T('general.status', 'Platform is live', { type: 'toggle', d: 'on', hint: 'Turn off to show visitors a "back soon" page. You can still use this admin.' }), T('general.logo', 'Logo', { type: 'image' }), T('general.favicon', 'Favicon', { type: 'image' })],
  contact: [T('contact.email', 'Email address'), T('contact.supportEmail', 'Support email'), T('contact.phone', 'Phone number'), T('contact.whatsapp', 'WhatsApp number'), T('contact.address', 'Address', { type: 'textarea' }), T('contact.hours', 'Opening hours')],
  social: [T('social.instagram', 'Instagram URL'), T('social.tiktok', 'TikTok URL'), T('social.facebook', 'Facebook URL'), T('social.x', 'X (Twitter) URL'), T('social.whatsapp', 'WhatsApp link')]
};
const STABS = [['general', 'General'], ['payments', 'Payments'], ['contact', 'Contact'], ['social', 'Social'], ['security', 'Security']];
let banks = settings.banks || [];

function bankRows() {
  $('#bankList').innerHTML = banks.length ? banks.map((b, i) => `<div class="bank-row"><div class="field"><label for="bk${i}">Bank name</label><input id="bk${i}" data-bank="${i}.bank" value="${esc(b.bank)}"></div><div class="field"><label for="bn${i}">Account name</label><input id="bn${i}" data-bank="${i}.name" value="${esc(b.name)}"></div><div class="field"><label for="bu${i}">Account number</label><input id="bu${i}" data-bank="${i}.number" inputmode="numeric" value="${esc(b.number)}"></div><button type="button" class="link-btn del" data-rmbank="${i}">Remove bank</button></div>`).join('') : '<p class="hint">No bank accounts yet. Add one to receive payments.</p>';
}
function readBanks() { $$('[data-bank]').forEach(el => { const [i, k] = el.dataset.bank.split('.'); banks[i][k] = el.value.trim(); }); }

function renderSettings() {
  $('#settingsTabs').innerHTML = STABS.map(([k, l], i) => `<button type="button" role="tab" id="tab-${k}" aria-controls="panel-${k}" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}" data-tab="${k}">${l}</button>`).join('');
  const form = k => `<form class="pform" data-group="${k}" novalidate>${SETTINGS[k].map(f => fieldHTML(f, settings)).join('')}<div><button class="btn" type="submit">Save changes</button></div></form>`;
  const panel = (k, body) => `<div class="card" role="tabpanel" id="panel-${k}" aria-labelledby="tab-${k}" ${k === 'general' ? '' : 'hidden'}>${body}</div>`;
  $('#settingsPanels').innerHTML =
    panel('general', form('general')) +
    panel('payments', `<form class="pform" id="bankForm" novalidate><p class="hint">Bank accounts customers can pay into. Add as many as you need.</p><div id="bankList" class="bank-list"></div><p class="err" id="bankErr" role="alert"></p><div class="actions-row"><button type="button" class="btn btn-ghost" id="addBank">Add bank</button><button class="btn" type="submit">Save banks</button></div></form>`) +
    panel('contact', form('contact')) + panel('social', form('social')) +
    panel('security', `<form class="pform" id="pwForm" novalidate><div class="field"><label for="curPw">Current password</label><input id="curPw" type="password" autocomplete="current-password"></div><div class="field"><label for="newPw">New password</label><input id="newPw" type="password" autocomplete="new-password"></div><div class="field"><label for="newPw2">Confirm new password</label><input id="newPw2" type="password" autocomplete="new-password"></div><p class="err" id="pwErr" role="alert"></p><div><button class="btn" type="submit">Change password</button></div></form>`);
  bankRows(); bindImages($('#settingsPanels'));
}
function showTab(k) {
  $$('[role=tab]').forEach(t => { const on = t.dataset.tab === k; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  $$('[role=tabpanel]').forEach(p => p.hidden = p.id !== 'panel-' + k);
}
$('#settingsTabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) showTab(t.dataset.tab); });
$('#settingsTabs').addEventListener('keydown', e => {
  const tabs = $$('[role=tab]'), i = tabs.indexOf(document.activeElement);
  if (i < 0 || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); showTab(n.dataset.tab);
});
$('#settingsPanels').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.group) { collect(f, settings); if (store.set('ibra_settings', settings)) { toast('Settings saved.'); refresh(); applyLogo(); } }
  else if (f.id === 'bankForm') {
    readBanks(); const err = $('#bankErr'); err.textContent = '';
    if (banks.some(b => !b.bank || !b.name || !/^\d{6,20}$/.test(b.number))) return err.textContent = 'Each bank needs a bank name, account name and a numeric account number.';
    settings.banks = banks; if (store.set('ibra_settings', settings)) toast('Bank details saved.');
  } else if (f.id === 'pwForm') {
    const err = $('#pwErr'), n = $('#newPw').value; err.textContent = '';
    if (getHash() && await hashPw($('#curPw').value) !== getHash()) return err.textContent = 'Current password is incorrect.';
    if (n.length < 8) return err.textContent = 'Use at least 8 characters.';
    if (n !== $('#newPw2').value) return err.textContent = 'The new passwords do not match.';
    try { localStorage.setItem(AUTH_KEY, await hashPw(n)); f.reset(); toast('Password changed.'); } catch (x) { err.textContent = 'Could not save in this browser.'; }
  }
});
$('#settingsPanels').addEventListener('click', e => {
  if (e.target.id === 'addBank') { readBanks(); banks.push({ bank: '', name: '', number: '' }); bankRows(); }
  const rm = e.target.closest('[data-rmbank]');
  if (rm) { readBanks(); banks.splice(+rm.dataset.rmbank, 1); bankRows(); }
});

/* ---------- Storefront editor ---------- */
const GROUPS = [
  ['Announcement bar', [T('announce', 'Text', { d: 'Complimentary delivery on orders above ₦150,000' })]],
  ['Hero', [T('hero.title', 'Headline', { d: 'The Art of' }), T('hero.gold', 'Gold highlighted word', { d: 'Presence.' }), T('hero.text', 'Intro text', { type: 'textarea', d: 'A refined collection of fragrances and beauty essentials created for those who leave an impression.' }), T('hero.cta1', 'Main button text', { d: 'Explore the collection' }), T('hero.cta2', 'Link text', { d: 'Discover MAISON IBRA' }), T('hero.img1', 'Image 1 (perfume)', { type: 'image' }), T('hero.img2', 'Image 2 (skincare)', { type: 'image' }), T('hero.img3', 'Image 3 (makeup)', { type: 'image' })]],
  ['Signature collection', [T('collection.title', 'Title', { d: 'The Signature Collection' }), T('collection.sub', 'Subtitle', { d: 'A curated expression of character, confidence and individuality.' }), T('collection.max', 'Maximum products shown', { type: 'number', d: 4 })]],
  ['Categories', [1, 2, 3].flatMap((n, i) => [T(`cat${n}.title`, `Category ${n} title`, { d: ['Perfume', 'Skincare', 'Makeup'][i] }), T(`cat${n}.line`, `Category ${n} line`, { d: ['Discover your signature scent.', 'Rituals for radiant skin.', 'Beauty with intention.'][i] }), T(`cat${n}.img`, `Category ${n} image`, { type: 'image' })])],
  ['Brand statement', [T('statement.line1', 'Line 1', { d: 'Beauty is not simply seen.' }), T('statement.line2', 'Line 2', { d: 'It is' }), T('statement.gold', 'Gold highlighted word', { d: 'remembered.' }), T('statement.text', 'Paragraph', { type: 'textarea' })]],
  ['Skincare & makeup', [T('beauty.title', 'Title', { d: 'Skincare & Makeup' }), T('beauty.sub', 'Subtitle', { d: 'Beauty rituals designed with the same quiet confidence.' }), T('beauty.max', 'Maximum products shown', { type: 'number', d: 4 })]],
  ['Story', [T('story.title', 'Title', { d: 'The MAISON IBRA Story' }), T('story.text', 'Text', { type: 'textarea' }), T('story.img', 'Image', { type: 'image' })]],
  ['Journal', [T('journal.title', 'Title', { d: 'The Journal' }), T('journal.max', 'Maximum articles shown', { type: 'number', d: 3 })]],
  ['Newsletter', [T('news.title', 'Title', { d: 'Enter the world of MAISON IBRA' }), T('news.text', 'Text', { type: 'textarea', d: 'Be the first to discover new fragrances, beauty rituals and exclusive releases.' })]]
];
function renderSite() {
  $('#siteGroups').innerHTML = GROUPS.map(([t, fs], i) => `<details class="grp" ${i === 0 ? 'open' : ''}><summary>${esc(t)}</summary><div class="pform">${fs.map(f => fieldHTML(f, site)).join('')}</div></details>`).join('');
}
bindImages($('#siteForm'));
$('#siteForm').addEventListener('submit', e => { e.preventDefault(); collect($('#siteForm'), site); if (store.set('ibra_site', site)) toast('Storefront saved. Refresh the home page to see it.'); });
$('#siteReset').addEventListener('click', () => { if (!confirm('Reset all storefront edits to the defaults?')) return; site = {}; localStorage.removeItem('ibra_site'); renderSite(); toast('Storefront reset.'); });

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
    renderCategoryOptions();
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
    toast(error.message || 'Using local product data.');
  }
}
function renderCategoryOptions() {
  const opts = categories.map(c => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('');
  $('#fType').innerHTML = opts;
  $('#productCategoryFilter').innerHTML = '<option value="">All categories</option>' + opts;
}
function filteredProducts() {
  const q = $('#q').value.trim().toLowerCase();
  const cat = $('#productCategoryFilter').value;
  const status = $('#productStatusFilter').value;
  let list = items.filter(p =>
    (!q || (p.name + ' ' + p.desc + ' ' + p.type).toLowerCase().includes(q)) &&
    (!cat || p.type === cat) &&
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
  const list = filteredProducts();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  productPage = Math.min(productPage, pages);
  const pageItems = list.slice((productPage - 1) * PAGE_SIZE, productPage * PAGE_SIZE);
  $('#productRows').innerHTML = pageItems.map(p => `<tr><td><div class="product-cell"><img src="${esc(p.image)}" alt="" onerror="this.hidden=true"><div><div class="pname">${esc(p.name)}</div><div class="pdesc">${esc(p.desc)}</div></div></div></td><td>${esc(CATS[p.type] || p.type)}</td><td>${fmt(p.price)}${p.compareAtPrice ? `<div class="pdesc">Sale ${fmt(p.compareAtPrice)}</div>` : ''}</td><td>${esc(p.stock)}</td><td><span class="badge ${p.status}">${esc(statusLabel(p.status))}</span></td><td>${p.featured ? 'Yes' : 'No'}</td><td>${esc((p.createdAt || '').slice(0, 10))}</td><td><div class="row-btns"><a class="act" href="../product.html?id=${encodeURIComponent(p.slug || p.id)}" target="_blank" rel="noopener" title="View" aria-label="View ${esc(p.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></a><button class="act" type="button" data-edit="${esc(p.id)}" title="Edit" aria-label="Edit ${esc(p.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/></svg></button><button class="act danger" type="button" data-del="${esc(p.id)}" title="Delete" aria-label="Delete ${esc(p.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div></td></tr>`).join('');
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
  }
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

/* ---------- Orders, customers, dashboard ---------- */
const orderRow = o => `<tr><td>${esc(o.id)}</td><td>${esc(o.customer)}</td><td>${esc(o.date)}</td><td>${fmt(o.total)}</td><td>${esc(o.status)}</td></tr>`;
function renderTables() {
  $('#orderRows').innerHTML = ORDERS.map(orderRow).join(''); $('#ordersEmpty').hidden = ORDERS.length > 0;
  $('#customerRows').innerHTML = CUSTOMERS.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${esc(c.orders)}</td></tr>`).join(''); $('#customersEmpty').hidden = CUSTOMERS.length > 0;
}
function renderStats() {
  $('#sProducts').textContent = items.length; $('#sActive').textContent = items.filter(p => p.status === 'active').length;
  $('#sOrders').textContent = ORDERS.length; $('#sCustomers').textContent = CUSTOMERS.length;
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
  const valid = acctList.filter(o => o.status !== 'cancelled'), rev = valid.reduce((s, o) => s + (+o.total || 0), 0);
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

renderSettings(); renderSite(); refresh(); applyLogo(); route();
ensureAdminSession().then(loadAdminProducts).catch(() => {
  sessionStorage.removeItem(SESSION_KEY);
  location.replace('../login.html');
});

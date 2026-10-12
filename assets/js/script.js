/* ---------- Placeholder content: replace with real data / CMS ---------- */
const CATEGORIES = [
  { title: 'Perfume', line: 'Discover your signature scent.', href: 'category1.html', image: './assets/images/perfume-ca.png' },
  { title: 'Skincare', line: 'Rituals for radiant skin.', href: 'category2.html', image: './assets/images/skincare -ca.png' },
  { title: 'Makeup', line: 'Beauty with intention.', href: 'category3.html', image: './assets/images/makeup-ca.png' }
];

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
document.documentElement.classList.add('js');
const toast = $('.toast');
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
async function loadStoreBranding() {
  if (!window.MaisonApi) return;
  try {
    const data = await MaisonApi.getStore();
    const store = data.store || {};
    const settings = store.settings || {};
    if (store.name) {
      document.title = document.title.replace(/MAISON IBRA/g, store.name);
      document.querySelectorAll('.logo-text').forEach(el => el.textContent = store.name);
    }
    if (store.logo_url) {
      document.querySelectorAll('.logo img').forEach(img => { img.src = store.logo_url; });
    }
    if (store.favicon_url) {
      let icon = document.querySelector('link[rel~="icon"]');
      if (!icon) {
        icon = document.createElement('link');
        icon.rel = 'icon';
        document.head.append(icon);
      }
      icon.href = store.favicon_url;
    }
    // The announcement bar, menu, footer and copyright line come from the storefront content: see storefront.js.
    // "Platform is live" switched off: show a back-soon page to visitors, but not to a signed-in admin.
    if (settings.maintenance) {
      let admin = false;
      try { admin = (await MaisonApi.me()).account?.type === 'admin'; } catch (error) {}
      if (!admin && !document.querySelector('.maint')) {
        const m = document.createElement('div');
        m.className = 'maint'; m.setAttribute('role', 'alert');
        m.innerHTML = `<h1>${esc(store.name || 'MAISON IBRA')}</h1><p>We are updating the store and will be back soon.</p>`;
        document.body.append(m); document.body.classList.add('is-off');
      }
    }
  } catch (error) {
    console.warn(error.message || error);
  }
}
loadStoreBranding();
window.MaisonAccount = window.MaisonAccount || { current: null };
async function loadCurrentAccount() {
  const cached = sessionStorage.getItem('maison_customer');
  if (cached) {
    try { window.MaisonAccount.current = { type: 'customer', customer: JSON.parse(cached) }; } catch (error) {}
  }

  if (window.MaisonApi) {
    try {
      const data = await MaisonApi.me();
      if (data.account?.type === 'customer') {
        window.MaisonAccount.current = data.account;
        sessionStorage.setItem('maison_customer', JSON.stringify(data.account.customer || {}));
      } else {
        // The server session is gone: do not keep showing (or checking out as) a customer that is no longer signed in.
        window.MaisonAccount.current = null;
        sessionStorage.removeItem('maison_customer');
      }
    } catch (error) {}
  }

  const customer = window.MaisonAccount.current?.customer;
  if (!customer) return;
  document.querySelectorAll('a[aria-label="Account"]').forEach(link => {
    link.setAttribute('aria-label', `Account, signed in as ${customer.name}`);
    link.title = `Signed in as ${customer.name}`;
  });
  document.dispatchEvent(new CustomEvent('maison:account', { detail: window.MaisonAccount.current }));
}
loadCurrentAccount();
const media = (p, ratio = 'ph-card') => p.image
  ? `<div class="ph ${ratio}"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>`
  : `<div class="ph ${ratio}" role="img" aria-label="[PRODUCT IMAGE] ${esc(p.name)}"><span>[PRODUCT IMAGE]</span></div>`;

/* ---------- Render ---------- */
const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
const link = (p, inner) => p.id ? `<a href="product.html?slug=${encodeURIComponent(p.id)}">${inner}</a>` : inner;
const card = p => `<article class="card reveal"><div class="media">${link(p, media(p))}
  <button class="wish" aria-pressed="false" aria-label="Add ${esc(p.name)} to wishlist">${heart}</button>
  ${p.status === 'out_of_stock' || p.stock === 0 ? '<button class="card-add" type="button" disabled>Out of stock</button>' : `<button class="card-add" data-add="${esc(p.name)}" data-id="${p.apiId || ''}">Add to bag</button>`}</div>
  <div class="card-info"><p class="card-cat">${esc(p.category)}</p><h3>${link(p, esc(p.name))}</h3><p class="card-desc">${esc(p.desc)}</p><p class="price">${esc(p.price)}</p></div></article>`;
const fill = (sel, items, fn) => { const el = $(sel); if (el) el.innerHTML = items.map(fn).join(''); };
fill('#catGrid', CATEGORIES, c => `<a class="cat" href="${c.href}" aria-label="Explore ${c.title}"><div class="ph"><span>[CATEGORY IMAGE]</span>${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.title)} collection" loading="lazy" decoding="async">` : ''}</div><div><h3>${c.title}</h3><p>${c.line}</p><span class="link-light">Explore</span></div></a>`);
document.querySelectorAll('#catGrid img').forEach(img => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });

/* ---------- Shopping bag: persistent cart, right-hand drawer and checkout ----------
   The saved bag is only [{ id, qty }] in localStorage, so it survives page changes and new tabs. Prices, names, stock and
   totals always come from the server (public/cart/quote), and the order itself is priced again by the server at checkout. */
const bagBtn = $('.bag-btn'), bagCount = $('.bag-count');
const CART_KEY = 'maison_cart_v1', CHECKOUT_KEY = 'maison_checkout_key', MAX_QTY = 99, RECEIPT_MAX = 5 * 1024 * 1024;
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const fmtMoney = (n, cur) => (cur || '₦') + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });

const Cart = {
  items: [],
  load() {
    try {
      const v = JSON.parse(localStorage.getItem(CART_KEY));
      this.items = Array.isArray(v) ? v.filter(i => Number.isInteger(i.id) && i.id > 0 && Number.isInteger(i.qty) && i.qty > 0).map(i => ({ id: i.id, qty: Math.min(MAX_QTY, i.qty) })) : [];
    } catch (e) { this.items = []; }
  },
  save() { try { localStorage.setItem(CART_KEY, JSON.stringify(this.items)); } catch (e) {} paintBagCount(); },
  count() { return this.items.reduce((n, i) => n + i.qty, 0); },
  add(id, qty = 1) { const row = this.items.find(i => i.id === id); if (row) row.qty = Math.min(MAX_QTY, row.qty + qty); else this.items.push({ id, qty: Math.min(MAX_QTY, qty) }); this.save(); },
  setQty(id, qty) { const row = this.items.find(i => i.id === id); if (row) { row.qty = Math.max(1, Math.min(MAX_QTY, qty)); this.save(); } },
  remove(id) { this.items = this.items.filter(i => i.id !== id); this.save(); },
  clear() { this.items = []; this.save(); }
};
function paintBagCount() {
  const n = Cart.count();
  bagCount.textContent = n;
  bagBtn.setAttribute('aria-label', `Shopping bag, ${n} item${n === 1 ? '' : 's'}`);
}
Cart.load(); paintBagCount();

const Bag = { open: false, view: 'cart', quote: null, quoteState: 'idle', quoteError: '', notice: '', accounts: null, accountsState: 'idle', order: null, busy: false, lastFocus: null, el: null, form: { name: '', email: '', phone: '', address: '', paid: false, file: null } };
const registeredCustomer = () => window.MaisonAccount?.current?.customer || null;

function addToBag(name, qty = 1, id = null) {
  if (!id) return showToast('This product is not available to order yet.');
  Cart.add(id, qty);
  showToast(`${qty > 1 ? qty + ' x ' : ''}${name} added to your bag.`);
  if (Bag.open) fetchQuote();
}

/* ----- drawer shell ----- */
function bagDom() {
  if (Bag.el) return Bag.el;
  const el = document.createElement('div');
  el.className = 'bag'; el.id = 'bagDrawer'; el.hidden = true;
  el.innerHTML = `<div class="bag-bg" data-bag-close></div>
    <aside class="bag-panel" role="dialog" aria-modal="true" aria-labelledby="bagTitle" tabindex="-1">
      <header class="bag-head"><h2 id="bagTitle">Your bag</h2><button class="icon-btn" type="button" data-bag-close aria-label="Close bag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></header>
      <div class="bag-body" id="bagBody"></div>
      <footer class="bag-foot" id="bagFoot"></footer>
    </aside>`;
  document.body.append(el);
  el.addEventListener('click', onBagClick);
  el.addEventListener('input', onBagInput);
  el.addEventListener('change', onBagInput);
  el.addEventListener('focusout', onBagBlur);
  el.addEventListener('submit', submitOrder);
  el.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = qa('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]', el.querySelector('.bag-panel')).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el.querySelector('.bag-panel'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  Bag.el = el;
  return el;
}
function openBag() {
  const el = bagDom();
  if (Bag.open) return;
  Bag.open = true; Bag.lastFocus = document.activeElement;
  if (Bag.view === 'done') Bag.view = 'cart';
  Bag.notice = '';
  el.hidden = false; document.body.style.overflow = 'hidden';
  bagBtn.setAttribute('aria-expanded', 'true');
  renderBag(); fetchQuote();
  el.querySelector('.bag-panel').focus();
}
function closeBag() {
  if (!Bag.open || Bag.busy) return; // never close while an order is being submitted
  Bag.open = false; Bag.el.hidden = true; document.body.style.overflow = '';
  bagBtn.setAttribute('aria-expanded', 'false');
  if (Bag.view === 'done') Bag.view = 'cart';
  Bag.lastFocus?.focus?.();
}
bagBtn.removeAttribute('data-soon');
bagBtn.setAttribute('aria-haspopup', 'dialog'); bagBtn.setAttribute('aria-controls', 'bagDrawer'); bagBtn.setAttribute('aria-expanded', 'false');
bagBtn.addEventListener('click', openBag);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && Bag.open) closeBag(); });
window.addEventListener('storage', e => { if (e.key === CART_KEY) { Cart.load(); paintBagCount(); if (Bag.open && Bag.view === 'cart') fetchQuote(); } }); // another tab changed the bag
document.addEventListener('maison:account', () => { if (Bag.open && Bag.view === 'checkout' && !Bag.busy) renderBag(); });

/* ----- pricing from the server ----- */
let quoteSeq = 0, quoteTimer;
const scheduleQuote = (ms = 250) => { clearTimeout(quoteTimer); quoteTimer = setTimeout(fetchQuote, ms); };
async function fetchQuote() {
  const items = Cart.items, seq = ++quoteSeq;
  if (!items.length) {
    Bag.quote = { lines: [], subtotal: 0, delivery_fee: 0, total: 0, currency: Bag.quote?.currency || '₦' };
    Bag.quoteState = 'ready';
    return renderBag();
  }
  if (!Bag.quote) { Bag.quoteState = 'loading'; renderBag(); }
  try {
    const q = await MaisonApi.quoteCart(items.map(i => ({ product_id: i.id, quantity: i.qty })));
    if (seq !== quoteSeq) return;
    Bag.quote = q; Bag.quoteState = 'ready'; Bag.quoteError = '';
    let changed = false; // quantities the server reduced to the available stock are written back to the saved bag
    q.lines.forEach(l => { const row = Cart.items.find(i => i.id === l.product_id); if (l.available && l.adjusted && row && row.qty !== l.quantity) { row.qty = l.quantity; changed = true; } });
    if (changed) Cart.save();
  } catch (error) {
    if (seq !== quoteSeq) return;
    Bag.quoteState = 'error'; Bag.quoteError = error.message || 'Could not load your bag.';
  }
  if (!(Bag.view === 'checkout' && Bag.busy)) renderBag();
}
const quoteBlocked = q => !q || !q.lines.length || q.lines.some(l => !l.available);

/* ----- rendering ----- */
function renderBag() {
  if (!Bag.el) return;
  $('#bagTitle').textContent = { cart: 'Your bag', checkout: 'Checkout', done: 'Order received' }[Bag.view];
  const body = $('#bagBody'), foot = $('#bagFoot');
  if (Bag.view === 'checkout') renderCheckoutView(body, foot);
  else if (Bag.view === 'done') renderDoneView(body, foot);
  else renderCartView(body, foot);
}
const totalsHTML = q => `<dl class="bag-totals"><div><dt>Subtotal</dt><dd>${fmtMoney(q.subtotal, q.currency)}</dd></div>${q.delivery_fee > 0 ? `<div><dt>Delivery</dt><dd>${fmtMoney(q.delivery_fee, q.currency)}</dd></div>` : ''}<div class="is-total"><dt>Total</dt><dd>${fmtMoney(q.total, q.currency)}</dd></div></dl>${q.delivery_fee > 0 && q.free_delivery_from ? `<p class="bag-hint">Free delivery on orders from ${fmtMoney(q.free_delivery_from, q.currency)}.</p>` : ''}`;
function lineHTML(l, cur) {
  const href = l.slug ? `product.html?slug=${encodeURIComponent(l.slug)}` : '#';
  const max = Math.min(MAX_QTY, l.stock || MAX_QTY);
  const qty = l.available ? `<div class="bag-qty" role="group" aria-label="Quantity for ${esc(l.name)}"><button type="button" data-bag-step="-1" data-id="${l.product_id}" aria-label="Decrease quantity" ${l.quantity <= 1 ? 'disabled' : ''}>&minus;</button><output aria-live="polite">${l.quantity}</output><button type="button" data-bag-step="1" data-id="${l.product_id}" aria-label="Increase quantity" ${l.quantity >= max ? 'disabled' : ''}>+</button></div>` : '';
  return `<li class="bag-line${l.available ? '' : ' is-off'}"><a class="bag-thumb ph" href="${href}" tabindex="-1" aria-hidden="true">${l.image_url ? `<img src="${esc(l.image_url)}" alt="" loading="lazy">` : ''}</a>
    <div class="bag-info"><a class="bag-name" href="${href}">${esc(l.name)}</a>${l.available ? `<p class="bag-unit">${fmtMoney(l.unit_price, cur)} each</p>` : ''}${qty}${l.message ? `<p class="bag-note">${esc(l.message)}</p>` : ''}</div>
    <div class="bag-side"><p class="bag-sub">${l.available ? fmtMoney(l.line_total, cur) : ''}</p><button class="bag-remove" type="button" data-bag-remove data-id="${l.product_id}" aria-label="Remove ${esc(l.name)} from your bag">Remove</button></div></li>`;
}
function renderCartView(body, foot) {
  const q = Bag.quote, notice = Bag.notice ? `<p class="bag-notice" role="alert">${esc(Bag.notice)}</p>` : '';
  if (!Cart.items.length) {
    body.innerHTML = notice + '<div class="bag-empty"><p>Your bag is empty.</p><button class="btn" type="button" data-bag-close>Continue shopping</button></div>';
    foot.innerHTML = ''; return;
  }
  if (!q) {
    body.innerHTML = notice + (Bag.quoteState === 'error'
      ? `<div class="bag-empty"><p>${esc(Bag.quoteError)}</p><button class="btn" type="button" data-bag-retry>Try again</button></div>`
      : '<p class="bag-loading" role="status">Loading your bag...</p>');
    foot.innerHTML = ''; return;
  }
  const stale = Bag.quoteState === 'error' ? `<p class="bag-notice" role="alert">${esc(Bag.quoteError)} <button class="bag-link" type="button" data-bag-retry>Retry</button></p>` : '';
  body.innerHTML = notice + stale + `<ul class="bag-lines">${q.lines.map(l => lineHTML(l, q.currency)).join('')}</ul>`;
  const blocked = quoteBlocked(q) || Bag.quoteState !== 'ready';
  foot.innerHTML = totalsHTML(q) + `<button class="btn bag-cta" type="button" data-bag-checkout ${blocked ? 'disabled' : ''}>Checkout</button>`
    + (q.lines.some(l => !l.available) ? '<p class="bag-hint">Remove the unavailable items to continue.</p>' : '')
    + '<button class="link-light bag-more" type="button" data-bag-close>Continue shopping</button>';
}

function changeQty(id, delta) {
  const line = Bag.quote?.lines.find(l => l.product_id === id), row = Cart.items.find(i => i.id === id);
  if (!row) return;
  const next = Math.max(1, Math.min(MAX_QTY, line?.stock || MAX_QTY, row.qty + delta));
  if (next === row.qty) return;
  Cart.setQty(id, next);
  if (line) { line.quantity = next; line.line_total = Math.round(line.unit_price * next * 100) / 100; recalcQuote(); } // instant feedback; the server re-prices next
  renderBag(); scheduleQuote();
}
function removeLine(id) {
  Cart.remove(id);
  if (Bag.quote) { Bag.quote.lines = Bag.quote.lines.filter(l => l.product_id !== id); recalcQuote(); }
  renderBag(); scheduleQuote(0);
}
function recalcQuote() {
  const q = Bag.quote;
  q.subtotal = Math.round(q.lines.filter(l => l.available).reduce((s, l) => s + l.line_total, 0) * 100) / 100;
  q.total = Math.round((q.subtotal + (q.delivery_fee || 0)) * 100) / 100;
}

/* ----- checkout ----- */
const V = {
  coName: v => /\p{L}/u.test(v) && v.trim().length >= 2 ? '' : 'Enter your full name.',
  coEmail: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 190 ? '' : 'Enter a valid email address.',
  coPhone: v => /^[0-9+()\-\s]{7,20}$/.test(v.trim()) && v.replace(/\D/g, '').length >= 7 ? '' : 'Enter a valid phone number.'
};
const FIELD = { coName: 'name', coEmail: 'email', coPhone: 'phone', coAddr: 'address' };
const detailsValid = () => !!registeredCustomer() || ['coName', 'coEmail', 'coPhone'].every(id => !V[id](Bag.form[FIELD[id]]));
const checkoutReady = () => !!(Bag.quote && !quoteBlocked(Bag.quote) && Bag.quoteState === 'ready' && detailsValid() && Bag.form.paid && Bag.accounts && Bag.accounts.length);
function updateSubmit() { const b = $('#coSubmit'); if (b) b.disabled = Bag.busy || !checkoutReady(); }
function fieldError(id, msg) {
  const input = $('#' + id), out = $(`[data-for="${id}"]`);
  if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  if (out) out.textContent = msg || '';
}
function checkoutKey() { // one token per checkout attempt; reused for retries of the same bag so a lost response can never create two orders
  const sig = Cart.items.map(i => i.id + ':' + i.qty).sort().join(',');
  try { const s = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY)); if (s && s.sig === sig && s.key) return s.key; } catch (e) {}
  const key = (window.crypto?.randomUUID?.() || ([...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')));
  try { sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ sig, key })); } catch (e) {}
  return key;
}
const clearCheckoutKey = () => { try { sessionStorage.removeItem(CHECKOUT_KEY); } catch (e) {} };

function startCheckout() {
  if (!Cart.items.length || quoteBlocked(Bag.quote)) return;
  Bag.view = 'checkout'; Bag.form.paid = false; Bag.notice = '';
  renderBag(); loadAccounts();
  $('#bagBody').scrollTop = 0; ($('#coName') || $('#coAddr'))?.focus();
}
async function loadAccounts() {
  Bag.accountsState = 'loading'; Bag.accounts = null; renderBankSection(); updateSubmit();
  try { Bag.accounts = (await MaisonApi.getBankAccounts()).accounts || []; Bag.accountsState = 'ready'; }
  catch (error) { Bag.accountsState = 'error'; }
  renderBankSection(); updateSubmit();
}
function renderBankSection() {
  const host = $('#coBanks'); if (!host) return;
  const q = Bag.quote;
  if (Bag.accountsState === 'loading') host.innerHTML = '<p class="co-hint" role="status">Loading bank details...</p>';
  else if (Bag.accountsState === 'error') host.innerHTML = '<p class="co-error">We could not load the payment details.</p><button class="btn" type="button" data-bag-accounts>Try again</button>';
  else if (!Bag.accounts?.length) host.innerHTML = '<p class="co-error">Bank transfer details are not available right now. Please contact the store to complete your order.</p>';
  else host.innerHTML = `<p class="co-hint">Transfer <strong>${fmtMoney(q?.total, q?.currency)}</strong> to one of the accounts below, then confirm your payment.</p><ul class="co-banks">${Bag.accounts.map(a => `<li><p class="co-bank">${esc(a.bank)}</p><dl><div><dt>Account name</dt><dd>${esc(a.name)}</dd></div><div><dt>Account number</dt><dd class="co-num">${esc(a.number)}<button class="co-copy" type="button" data-copy="${esc(a.number)}">Copy</button></dd></div></dl></li>`).join('')}</ul>`;
}
function renderReceiptRow() {
  const row = $('#coReceiptRow'); if (!row) return;
  const f = Bag.form.file;
  row.innerHTML = f
    ? `<div class="co-file"><span>${esc(f.name)} <small>(${(f.size / 1024).toFixed(0)} KB)</small></span><button class="co-copy" type="button" data-co-file-remove>Remove</button></div>`
    : '<input id="coReceipt" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" aria-describedby="coReceiptErr">';
}
function receiptProblem(file) {
  if (!/\.(jpe?g|png|pdf)$/i.test(file.name) || (file.type && !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type))) return 'Only JPG, PNG or PDF files are accepted.';
  if (file.size > RECEIPT_MAX) return 'The file is too large. The limit is 5 MB.';
  if (file.size === 0) return 'The file is empty.';
  return '';
}
function renderCheckoutView(body, foot) {
  const q = Bag.quote, f = Bag.form, reg = registeredCustomer();
  const summary = q.lines.filter(l => l.available).map(l => `<li><span>${l.quantity} &times; ${esc(l.name)}</span><span>${fmtMoney(l.line_total, q.currency)}</span></li>`).join('');
  const guest = reg
    ? `<p class="co-account">Ordering as <strong>${esc(reg.name)}</strong><br>${esc(reg.email)}${reg.phone ? ' &middot; ' + esc(reg.phone) : ''}</p>`
    : `<div class="co-field"><label for="coName">Full name</label><input id="coName" autocomplete="name" maxlength="160" value="${esc(f.name)}" required><p class="co-fielderr" data-for="coName"></p></div>
       <div class="co-field"><label for="coEmail">Email address</label><input id="coEmail" type="email" inputmode="email" autocomplete="email" maxlength="190" value="${esc(f.email)}" required><p class="co-fielderr" data-for="coEmail"></p></div>
       <div class="co-field"><label for="coPhone">Phone number</label><input id="coPhone" type="tel" autocomplete="tel" maxlength="20" value="${esc(f.phone)}" required><p class="co-fielderr" data-for="coPhone"></p></div>
       <p class="co-hint">Have an account? <a href="login.html" data-bag-login>Sign in</a> to use your saved details.</p>`;
  body.innerHTML = `<button class="bag-back" type="button" data-bag-view="cart">&larr; Back to bag</button>
    <form id="bagCheckout" novalidate><fieldset id="coFields">
      <section class="co-sec"><h3>Order summary</h3><ul class="co-lines">${summary}</ul></section>
      <section class="co-sec"><h3>Your details</h3>${guest}
        <div class="co-field"><label for="coAddr">Delivery address <span>(optional)</span></label><textarea id="coAddr" rows="2" maxlength="500">${esc(f.address)}</textarea><p class="co-fielderr" data-for="coAddr"></p></div></section>
      <section class="co-sec" aria-live="polite"><h3>Pay by bank transfer</h3><div id="coBanks"></div></section>
      <section class="co-sec"><h3>Payment receipt <span>(optional)</span></h3><div id="coReceiptRow"></div><p class="co-hint">JPG, PNG or PDF, up to 5 MB.</p><p class="co-fielderr" id="coReceiptErr" role="alert"></p></section>
      <label class="co-check"><input type="checkbox" id="coPaid" ${f.paid ? 'checked' : ''}><span>I have made the payment to the bank account displayed above.</span></label>
      <p class="co-fielderr" id="coPaidErr"></p>
      <p class="co-error" id="coError" role="alert"></p>
    </fieldset></form>`;
  foot.innerHTML = totalsHTML(q) + '<button class="btn bag-cta" type="submit" form="bagCheckout" id="coSubmit" disabled><span class="co-spin" aria-hidden="true" hidden></span><span id="coSubmitLabel">Place order</span></button><p class="bag-hint">Your order stays pending until we verify your payment.</p>';
  renderBankSection(); renderReceiptRow(); updateSubmit();
}
function renderDoneView(body, foot) {
  const o = Bag.order, first = String(o.customer?.name || '').split(' ')[0];
  body.innerHTML = `<div class="co-done"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/></svg>
    <h3 tabindex="-1" id="coDoneTitle">Thank you${first ? ', ' + esc(first) : ''}.</h3><p>Your order has been received.</p>
    <div class="co-ref"><span>Order reference</span><strong>${esc(o.order_number)}</strong><button class="co-copy" type="button" data-copy="${esc(o.order_number)}">Copy</button></div>
    <p class="co-status">Status: <strong>Pending payment verification</strong>. We will start processing your order once your payment has been confirmed.</p>
    <p class="co-hint">${o.receipt_uploaded ? 'Your payment receipt was uploaded.' : 'You did not upload a receipt. Keep it safe and quote your order reference if we contact you.'}</p>
    <ul class="co-lines">${o.items.map(i => `<li><span>${i.quantity} &times; ${esc(i.name)}</span><span>${fmtMoney(i.line_total, o.currency)}</span></li>`).join('')}</ul>${totalsHTML(o)}</div>`;
  foot.innerHTML = '<button class="btn bag-cta" type="button" data-bag-close>Continue shopping</button>';
  $('#coDoneTitle')?.focus();
}

function setBusy(on) {
  Bag.busy = on;
  const b = $('#coSubmit'); if (!b) return;
  b.disabled = on || !checkoutReady();
  b.setAttribute('aria-busy', on);
  $('.co-spin', b).hidden = !on;
  $('#coSubmitLabel').textContent = on ? 'Placing order...' : 'Place order';
  const fs = $('#coFields'); if (fs) fs.disabled = on;
}
async function submitOrder(e) {
  if (e.target.id !== 'bagCheckout') return;
  e.preventDefault();
  if (Bag.busy) return;
  if (!checkoutReady()) { ['coName', 'coEmail', 'coPhone'].forEach(id => $('#' + id) && fieldError(id, V[id](Bag.form[FIELD[id]]))); return; }
  setBusy(true); // disable the button and show the spinner before anything else happens
  $('#coError').textContent = '';
  const f = Bag.form, reg = registeredCustomer(), fd = new FormData();
  fd.set('items', JSON.stringify(Cart.items.map(i => ({ product_id: i.id, quantity: i.qty }))));
  fd.set('idempotency_key', checkoutKey());
  fd.set('payment_confirmed', '1');
  if (!reg) { fd.set('full_name', f.name.trim()); fd.set('email', f.email.trim()); fd.set('phone', f.phone.trim()); }
  if (f.address.trim()) fd.set('delivery_address', f.address.trim());
  if (f.file) fd.set('receipt', f.file, f.file.name);
  try {
    const res = await MaisonApi.placeOrder(fd);
    Cart.clear(); clearCheckoutKey();
    Bag.order = res.order; Bag.quote = null; Bag.view = 'done';
    Bag.form = { name: f.name, email: f.email, phone: f.phone, address: '', paid: false, file: null };
    setBusy(false); renderBag();
  } catch (error) { orderFailed(error); }
}
function orderFailed(error) {
  setBusy(false); // recoverable: the button comes back and the form keeps what was typed
  const d = error.details || {};
  if (error.status === 401) { Bag.notice = 'Your session expired. Please try again.'; }
  if (d.items || (error.status === 409 && !d.payment)) { // prices / stock changed: back to the bag with the reason
    Bag.view = 'cart'; Bag.notice = error.message; Bag.quote = null; renderBag(); fetchQuote(); return;
  }
  if (d.idempotency_key) clearCheckoutKey();
  const map = { full_name: 'coName', email: 'coEmail', phone: 'coPhone', delivery_address: 'coAddr' };
  Object.keys(map).forEach(k => d[k] && fieldError(map[k], d[k]));
  if (d.receipt) { Bag.form.file = null; renderReceiptRow(); $('#coReceiptErr').textContent = d.receipt; }
  if (d.payment_confirmed) $('#coPaidErr').textContent = d.payment_confirmed;
  const generic = !error.message || /validation failed/i.test(error.message);
  $('#coError').textContent = generic ? (Object.values(d)[0] || 'Please check your details and try again.') : error.message;
  updateSubmit();
}

/* ----- events ----- */
function onBagClick(e) {
  const t = e.target;
  if (t.closest('[data-bag-close]')) return closeBag();
  const step = t.closest('[data-bag-step]'); if (step) return changeQty(+step.dataset.id, +step.dataset.bagStep);
  const rm = t.closest('[data-bag-remove]'); if (rm) return removeLine(+rm.dataset.id);
  if (t.closest('[data-bag-checkout]')) return startCheckout();
  if (t.closest('[data-bag-retry]')) return fetchQuote();
  if (t.closest('[data-bag-accounts]')) return loadAccounts();
  const view = t.closest('[data-bag-view]'); if (view) { Bag.view = view.dataset.bagView; renderBag(); return fetchQuote(); }
  if (t.closest('[data-bag-login]')) { try { sessionStorage.setItem('maison_after_login', location.pathname.split('/').pop() + location.search); } catch (err) {} return; }
  if (t.closest('[data-co-file-remove]')) { Bag.form.file = null; renderReceiptRow(); $('#coReceiptErr').textContent = ''; return; }
  const copy = t.closest('[data-copy]');
  if (copy) {
    const done = () => { const old = copy.textContent; copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = old; }, 1500); };
    (navigator.clipboard?.writeText(copy.dataset.copy) || Promise.reject()).then(done).catch(() => showToast('Select the number and copy it manually.'));
  }
}
function onBagInput(e) {
  const t = e.target;
  if (t.id === 'coReceipt') {
    const file = t.files[0];
    if (!file) return; // a file pick fires both input and change; the second pass must not wipe the message shown by the first
    $('#coReceiptErr').textContent = '';
    const problem = receiptProblem(file);
    if (problem) { t.value = ''; Bag.form.file = null; $('#coReceiptErr').textContent = problem; } else { Bag.form.file = file; renderReceiptRow(); }
    return;
  }
  if (t.id === 'coPaid') { Bag.form.paid = t.checked; $('#coPaidErr').textContent = ''; }
  else if (FIELD[t.id]) { Bag.form[FIELD[t.id]] = t.value; if (t.getAttribute('aria-invalid') && !(V[t.id] && V[t.id](t.value))) fieldError(t.id, ''); }
  updateSubmit();
}
function onBagBlur(e) { const id = e.target.id; if (V[id] && e.target.value !== '') fieldError(id, V[id](e.target.value)); }

/* ---------- Wishlist, placeholder links ---------- */
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) return addToBag(add.dataset.add, 1, parseInt(add.dataset.id, 10) || null);
  const wish = e.target.closest('.wish');
  if (wish) {
    const on = wish.getAttribute('aria-pressed') !== 'true';
    wish.setAttribute('aria-pressed', on);
    return showToast(on ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
  }
  const soon = e.target.closest('[data-soon]');
  if (soon) {
    if (soon.tagName === 'A') e.preventDefault();
    showToast(soon.dataset.soon);
  }
});

/* ---------- Mobile drawer ---------- */
const drawer = $('#drawer'), menuBtn = $('.menu-btn');
function setDrawer(open) {
  drawer.hidden = !open;
  menuBtn.setAttribute('aria-expanded', open);
  document.body.style.overflow = open ? 'hidden' : '';
  (open ? $('.close-btn') : menuBtn).focus();
}
menuBtn.addEventListener('click', () => setDrawer(true));
drawer.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.closest('.drawer-panel a')) setDrawer(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !drawer.hidden) setDrawer(false); });

/* ---------- Hero images: fall back to labelled placeholder if a file is missing ---------- */
document.querySelectorAll('.tile img').forEach(img => {
  const drop = () => img.remove();
  img.addEventListener('error', drop);
  if (img.complete && !img.naturalWidth) drop();
});

/* ---------- Reveal on scroll ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
const observeReveals = () => document.querySelectorAll('.reveal:not(.in)').forEach(el => io ? io.observe(el) : el.classList.add('in'));
observeReveals();

/* ---------- Newsletter (wire to your email provider in submit handler) ---------- */
$('#newsForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#email'), msg = $('#formMsg');
  if (!input.checkValidity() || !input.value.trim()) {
    msg.textContent = 'Enter a valid email address.';
    input.setAttribute('aria-invalid', 'true');
    return input.focus();
  }
  input.removeAttribute('aria-invalid');
  // TODO: POST input.value to your newsletter provider here.
  msg.textContent = (window.MaisonStorefront && window.MaisonStorefront.global && window.MaisonStorefront.global.newsletter && window.MaisonStorefront.global.newsletter.success) || 'Thank you. You are on the list.';
  input.value = '';
});

const logoImg = $('.logo img');
logoImg.addEventListener('error', () => { $('.logo').classList.add('no-img'); logoImg.remove(); });
if (logoImg.complete && !logoImg.naturalWidth) logoImg.dispatchEvent(new Event('error'));

$('#year').textContent = new Date().getFullYear();
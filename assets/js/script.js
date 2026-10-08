/* ---------- Placeholder content: replace with real data / CMS ---------- */
const SIGNATURE = [1, 2, 3, 4].map(n => ({ name: `[PRODUCT NAME ${n}]`, category: '[FRAGRANCE CATEGORY]', desc: '[PRODUCT DESCRIPTION]', price: '[PRICE]', image: '' }));
const BEAUTY = [
  { name: '[PRODUCT NAME]', category: 'Skincare', desc: '[PRODUCT DESCRIPTION]', price: '[PRICE]', image: '' },
  { name: '[PRODUCT NAME]', category: 'Skincare', desc: '[PRODUCT DESCRIPTION]', price: '[PRICE]', image: '' },
  { name: '[PRODUCT NAME]', category: 'Makeup', desc: '[PRODUCT DESCRIPTION]', price: '[PRICE]', image: '' },
  { name: '[PRODUCT NAME]', category: 'Makeup', desc: '[PRODUCT DESCRIPTION]', price: '[PRICE]', image: '' }
];
const CATEGORIES = [
  { title: 'Perfume', line: 'Discover your signature scent.', href: '#collection', image: './assets/images/perfume-ca.png' },
  { title: 'Skincare', line: 'Rituals for radiant skin.', href: '#beauty', image: './assets/images/skincare -ca.png' },
  { title: 'Makeup', line: 'Beauty with intention.', href: '#beauty', image: './assets/images/makeup-ca.png' }
];
const JOURNAL = ['Fragrance', 'Skincare', 'Lifestyle'].map(c => ({ category: c, title: '[ARTICLE TITLE]', date: '[DATE]' }));

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
const media = (p, ratio = 'ph-card') => p.image
  ? `<div class="ph ${ratio}"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></div>`
  : `<div class="ph ${ratio}" role="img" aria-label="[PRODUCT IMAGE] ${esc(p.name)}"><span>[PRODUCT IMAGE]</span></div>`;

/* ---------- Render ---------- */
const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
const link = (p, inner) => p.id ? `<a href="product.html?id=${encodeURIComponent(p.id)}">${inner}</a>` : inner;
const card = p => `<article class="card reveal"><div class="media">${link(p, media(p))}
  <button class="wish" aria-pressed="false" aria-label="Add ${esc(p.name)} to wishlist">${heart}</button>
  <button class="card-add" data-add="${esc(p.name)}">Add to bag</button></div>
  <div class="card-info"><p class="card-cat">${esc(p.category)}</p><h3>${link(p, esc(p.name))}</h3><p class="card-desc">${esc(p.desc)}</p><p class="price">${esc(p.price)}</p></div></article>`;
const fill = (sel, items, fn) => { const el = $(sel); if (el) el.innerHTML = items.map(fn).join(''); };
fill('#signatureGrid', SIGNATURE, card);
fill('#beautyGrid', BEAUTY, card);
fill('#catGrid', CATEGORIES, c => `<a class="cat" href="${c.href}" aria-label="Explore ${c.title}"><div class="ph"><span>[CATEGORY IMAGE]</span>${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.title)} collection" loading="lazy" decoding="async">` : ''}</div><div><h3>${c.title}</h3><p>${c.line}</p><span class="link-light">Explore</span></div></a>`);
document.querySelectorAll('#catGrid img').forEach(img => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });
fill('#journalGrid', JOURNAL, j => `<article class="post reveal"><div class="ph" role="img" aria-label="[EDITORIAL IMAGE] ${j.category}"><span>[EDITORIAL IMAGE]</span></div><p class="post-meta">${j.category} &nbsp;|&nbsp; ${j.date}</p><h3>${j.title}</h3><a class="read" href="#top" data-soon="Journal articles are coming soon.">Read article</a></article>`);

/* ---------- Bag, wishlist, placeholder links ---------- */
const bagBtn = $('.bag-btn'), bagCount = $('.bag-count');
let bag = 0;
function addToBag(name, qty = 1) {
  bag += qty;
  bagCount.textContent = bag;
  bagBtn.setAttribute('aria-label', `Shopping bag, ${bag} item${bag > 1 ? 's' : ''}`);
  showToast(`${qty > 1 ? qty + ' × ' : ''}${name} added to your bag.`);
}
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) return addToBag(add.dataset.add);
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
  msg.textContent = 'Thank you. You are on the list.';
  input.value = '';
});

const logoImg = $('.logo img');
logoImg.addEventListener('error', () => { $('.logo').classList.add('no-img'); logoImg.remove(); });
if (logoImg.complete && !logoImg.naturalWidth) logoImg.dispatchEvent(new Event('error'));

$('#year').textContent = new Date().getFullYear();
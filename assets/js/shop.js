/* Shop page. Uses helpers from script.js and product data from products.js.
   Filters: category chips (?category=perfume) and, below them, subcategory chips (?sub=attar-oil). */
if (typeof PRODUCTS === 'undefined') throw new Error('shop.js needs products.js loaded first: add <script src="./assets/js/products.js"></script> before shop.js in shop.html.');

const grid = $('#shopGrid'), count = $('#count'), empty = $('#empty'), sortSel = $('#sort'), subBar = $('#subFilters');
const chips = [...document.querySelectorAll('.filters .chip')];
const qs = new URLSearchParams(location.search);
let filter = qs.get('category');
if (!LABELS[filter]) filter = 'all';
let sub = qs.get('sub') || '';
let apiLoaded = false; // keep ?sub= until the real products (with subcategories) have arrived

function setUrl() {
  const q = new URLSearchParams();
  if (filter !== 'all') q.set('category', filter);
  if (sub) q.set('sub', sub);
  history.replaceState(null, '', q.toString() ? `shop.html?${q}` : 'shop.html');
}

function render() {
  const inCategory = PRODUCTS.filter(p => filter === 'all' || p.type === filter);
  const subs = filter === 'all' ? [] : subcategoriesOf(inCategory);
  if (apiLoaded && sub && !subs.some(s => s.slug === sub)) sub = '';
  renderSubFilters(subBar, subs, sub, filter === 'all' ? 'All' : `All ${LABELS[filter]}`, inCategory.length, picked => { sub = picked; setUrl(); render(); });

  let list = inCategory.filter(p => !sub || !apiLoaded || p.subtype === sub);
  const dir = { low: 1, high: -1 }[sortSel.value];
  if (dir) list = [...list].sort((a, b) => (a.price == null) - (b.price == null) || dir * ((a.price ?? 0) - (b.price ?? 0)));
  grid.innerHTML = list.map(p => card(view(p))).join('');
  count.textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
  empty.hidden = list.length > 0;
  chips.forEach(c => c.setAttribute('aria-pressed', c.dataset.filter === filter));
  grid.querySelectorAll('.ph img').forEach(img => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });
  observeReveals();
}

chips.forEach(c => c.addEventListener('click', () => {
  filter = c.dataset.filter;
  sub = '';
  setUrl();
  render();
}));
sortSel.addEventListener('change', render);
document.addEventListener('maison:products', () => { apiLoaded = true; render(); });
render();

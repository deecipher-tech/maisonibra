/* Shop page. Uses helpers from script.js and product data from products.js. */
if (typeof PRODUCTS === 'undefined') throw new Error('shop.js needs products.js loaded first: add <script src="./assets/js/products.js"></script> before shop.js in shop.html.');

const grid = $('#shopGrid'), count = $('#count'), empty = $('#empty'), sortSel = $('#sort');
const chips = [...document.querySelectorAll('.chip')];
let filter = new URLSearchParams(location.search).get('category');
if (!LABELS[filter]) filter = 'all';

function render() {
  let list = PRODUCTS.filter(p => filter === 'all' || p.type === filter);
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
  history.replaceState(null, '', filter === 'all' ? 'shop.html' : `shop.html?category=${filter}`);
  render();
}));
sortSel.addEventListener('change', render);
document.addEventListener('maison:products', render);
render();

/* Shop page. Uses helpers from script.js (card, esc, $, observeReveals).
   PRODUCTS: replace placeholders with real data. type = perfume | skincare | makeup.
   price = number in naira (e.g. 85000), or null while unknown. image = path or ''. */
const LABELS = { perfume: 'Perfume', skincare: 'Skincare', makeup: 'Makeup' };
const PRODUCTS = ['perfume', 'skincare', 'makeup'].flatMap(type =>
  [1, 2, 3, 4].map(n => ({
    type, category: LABELS[type], name: `[${LABELS[type].toUpperCase()} NAME ${n}]`,
    desc: '[PRODUCT DESCRIPTION]', price: null, image: ''
  }))
);
const money = n => '₦' + n.toLocaleString('en-NG');

const grid = $('#shopGrid'), count = $('#count'), empty = $('#empty'), sortSel = $('#sort');
const chips = [...document.querySelectorAll('.chip')];
let filter = new URLSearchParams(location.search).get('category');
if (!LABELS[filter]) filter = 'all';

function render() {
  let list = PRODUCTS.filter(p => filter === 'all' || p.type === filter);
  const dir = { low: 1, high: -1 }[sortSel.value];
  if (dir) list = [...list].sort((a, b) => (a.price == null) - (b.price == null) || dir * ((a.price ?? 0) - (b.price ?? 0)));
  grid.innerHTML = list.map(p => card({ ...p, price: p.price == null ? '[PRICE]' : money(p.price) })).join('');
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
render();
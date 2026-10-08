/* Perfume page. Uses helpers from script.js and product data from products.js (type: 'perfume'). */
if (typeof PRODUCTS === 'undefined') throw new Error('perfumes.js needs products.js loaded first.');
const perfumes = PRODUCTS.filter(p => p.type === 'perfume');
const pGrid = $('#perfumeGrid'), pCount = $('#count'), pEmpty = $('#empty'), pSort = $('#sort');

function renderPerfumes() {
  let list = perfumes;
  const dir = { low: 1, high: -1 }[pSort.value];
  if (dir) list = [...list].sort((a, b) => (a.price == null) - (b.price == null) || dir * ((a.price ?? 0) - (b.price ?? 0)));
  pGrid.innerHTML = list.map(p => card(view(p))).join('');
  pCount.textContent = `${list.length} fragrance${list.length === 1 ? '' : 's'}`;
  pEmpty.hidden = list.length > 0;
  pGrid.querySelectorAll('.ph img').forEach(img => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });
  observeReveals();
}
pSort.addEventListener('change', renderPerfumes);
renderPerfumes();
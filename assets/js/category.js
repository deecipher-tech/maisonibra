/* Category pages (skincare, makeup...). Uses helpers from script.js and data from products.js.
   The product type comes from data-type on #categoryGrid. */
if (typeof PRODUCTS === 'undefined') throw new Error('category.js needs products.js loaded first.');
const cGrid = $('#categoryGrid'), cCount = $('#count'), cEmpty = $('#empty'), cSort = $('#sort');
const cItems = PRODUCTS.filter(p => p.type === cGrid.dataset.type);

function renderCategory() {
  let list = cItems;
  const dir = { low: 1, high: -1 }[cSort.value];
  if (dir) list = [...list].sort((a, b) => (a.price == null) - (b.price == null) || dir * ((a.price ?? 0) - (b.price ?? 0)));
  cGrid.innerHTML = list.map(p => card(view(p))).join('');
  cCount.textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
  cEmpty.hidden = list.length > 0;
  cGrid.querySelectorAll('.ph img').forEach(img => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });
  observeReveals();
}
cSort.addEventListener('change', renderCategory);
renderCategory();
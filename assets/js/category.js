/* Category pages (perfume, skincare, makeup). Uses helpers from script.js and data from products.js.
   The top-level category comes from data-type on #categoryGrid; subcategory chips appear above the grid (?sub=slug). */
if (typeof PRODUCTS === 'undefined') throw new Error('category.js needs products.js loaded first.');
const cGrid = $('#categoryGrid'), cCount = $('#count'), cEmpty = $('#empty'), cSort = $('#sort'), cSubs = $('#subFilters');
const cType = cGrid.dataset.type;
let cSub = new URLSearchParams(location.search).get('sub') || '';
let cLoaded = false;

function renderCategory() {
  const base = PRODUCTS.filter(p => p.type === cType);
  const subs = subcategoriesOf(base);
  if (cLoaded && cSub && !subs.some(s => s.slug === cSub)) cSub = '';
  renderSubFilters(cSubs, subs, cSub, `All ${LABELS[cType] || 'products'}`, base.length, picked => {
    cSub = picked;
    history.replaceState(null, '', cSub ? `?sub=${encodeURIComponent(cSub)}` : location.pathname);
    renderCategory();
  });

  let list = base.filter(p => !cSub || !cLoaded || p.subtype === cSub);
  const dir = { low: 1, high: -1 }[cSort.value];
  if (dir) list = [...list].sort((a, b) => (a.price == null) - (b.price == null) || dir * ((a.price ?? 0) - (b.price ?? 0)));
  cGrid.innerHTML = list.map(p => card(view(p))).join('');
  cCount.textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
  cEmpty.hidden = list.length > 0;
  cGrid.querySelectorAll('.ph img').forEach(img => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });
  observeReveals();
}
cSort.addEventListener('change', renderCategory);
document.addEventListener('maison:products', () => { cLoaded = true; renderCategory(); });
renderCategory();
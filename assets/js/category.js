/* Category pages (perfume, skincare, makeup). Server-side pagination; uses helpers from script.js and products.js.
   The top-level category comes from data-type on #categoryGrid; sub-category chips come from the API (?sub=slug&page=2). */
if (typeof PRODUCTS === 'undefined') throw new Error('category.js needs products.js loaded first.');
const PER_PAGE = 12;
const cGrid = $('#categoryGrid'), cCount = $('#count'), cEmpty = $('#empty'), cSort = $('#sort'), cSubs = $('#subFilters'), cPager = $('#pager');
const cType = cGrid.dataset.type;
const cEmptyText = cEmpty.textContent;
const cQs = new URLSearchParams(location.search);
let cSub = cQs.get('sub') || '';
let cPage = Math.max(1, parseInt(cQs.get('page'), 10) || 1);
let cTree = null, cSeq = 0;

function setCategoryUrl() {
  const q = new URLSearchParams();
  if (cSub) q.set('sub', cSub);
  if (cPage > 1) q.set('page', cPage);
  history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname);
}

function renderCategoryChips() {
  const subs = cTree ? cTree.filter(c => c.parent_slug === cType).map(c => ({ slug: c.slug, name: c.name, order: c.sort_order, count: c.product_count })) : [];
  const top = cTree && cTree.find(c => c.slug === cType);
  renderSubFilters(cSubs, subs, cSub, `All ${LABELS[cType] || 'products'}`, top ? top.product_count : 0, picked => { cSub = picked; cPage = 1; setCategoryUrl(); renderCategoryChips(); renderCategory(); });
}

async function renderCategory(scrollToTop = false) {
  const seq = ++cSeq;
  cGrid.setAttribute('aria-busy', 'true'); cGrid.style.opacity = '.45';
  const ld = Ui.loading(cGrid, Ui.sk.cards(Ui.sk.count(2)));
  try {
    const data = await MaisonApi.getProducts({ category: cSub || cType, page: cPage, per_page: PER_PAGE, sort: cSort.value });
    await ld.end();
    if (seq !== cSeq) return;
    const pg = data.pagination;
    cPage = pg.page;
    setCategoryUrl();
    const list = data.products.map(apiProductToCard);
    cGrid.innerHTML = list.map(p => card(view(p))).join('');
    const from = (pg.page - 1) * pg.per_page + 1;
    cCount.textContent = pg.total ? `Showing ${from}-${from + list.length - 1} of ${pg.total} product${pg.total === 1 ? '' : 's'}` : '0 products';
    cEmpty.textContent = cEmptyText; cEmpty.hidden = list.length > 0;
    renderPager(cPager, pg, n => { cPage = n; setCategoryUrl(); renderCategory(true); });
    cGrid.querySelectorAll('.ph img').forEach(img => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });
    observeReveals();
    if (scrollToTop) $('.toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    await ld.end();
    if (seq !== cSeq) return;
    cGrid.innerHTML = Ui.errorBox(error, { title: 'We could not load the products' }); cCount.textContent = ''; cPager.hidden = true; cEmpty.hidden = true;
    Ui.onRetry(cGrid, () => renderCategory());
  } finally {
    if (seq === cSeq) { cGrid.removeAttribute('aria-busy'); cGrid.style.opacity = ''; }
  }
}
cSort.addEventListener('change', () => { cPage = 1; renderCategory(); });

MaisonApi.getCategories().then(d => { cTree = d.categories || []; }).catch(() => { cTree = null; }).then(() => {
  if (cTree && cSub && !cTree.some(c => c.slug === cSub && c.parent_slug === cType)) cSub = '';
  renderCategoryChips();
  renderCategory();
});
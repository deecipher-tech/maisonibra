/* Shop page. Server-side pagination: each request asks the API for one page of the current category / sub-category / sort.
   Uses helpers from script.js and products.js. URL: ?category=perfume&sub=attar-oil&page=2 */
if (typeof PRODUCTS === 'undefined') throw new Error('shop.js needs products.js loaded first: add <script src="./assets/js/products.js"></script> before shop.js in shop.html.');

const PER_PAGE = 12;
const grid = $('#shopGrid'), count = $('#count'), empty = $('#empty'), sortSel = $('#sort'), subBar = $('#subFilters'), pager = $('#pager');
const chips = [...document.querySelectorAll('.filters .chip')];
const emptyText = empty.textContent;
const qs = new URLSearchParams(location.search);
let filter = qs.get('category');
if (!LABELS[filter]) filter = 'all';
let sub = qs.get('sub') || '';
let page = Math.max(1, parseInt(qs.get('page'), 10) || 1);
let tree = null, loadSeq = 0;

function setUrl() {
  const q = new URLSearchParams();
  if (filter !== 'all') q.set('category', filter);
  if (sub) q.set('sub', sub);
  if (page > 1) q.set('page', page);
  history.replaceState(null, '', q.toString() ? `shop.html?${q}` : 'shop.html');
}

function renderChips() {
  const subs = filter === 'all' || !tree ? [] : tree.filter(c => c.parent_slug === filter).map(c => ({ slug: c.slug, name: c.name, order: c.sort_order, count: c.product_count }));
  const top = tree && tree.find(c => c.slug === filter);
  renderSubFilters(subBar, subs, sub, filter === 'all' ? 'All' : `All ${LABELS[filter]}`, top ? top.product_count : 0, picked => { sub = picked; page = 1; setUrl(); load(); });
  chips.forEach(c => c.setAttribute('aria-pressed', c.dataset.filter === filter));
}

async function load(scrollToTop = false) {
  const seq = ++loadSeq;
  grid.setAttribute('aria-busy', 'true'); grid.style.opacity = '.45'; // old results dim at once; a skeleton replaces them if the wait is noticeable
  const ld = Ui.loading(grid, Ui.sk.cards(Ui.sk.count(2)));
  const params = { page, per_page: PER_PAGE, sort: sortSel.value };
  const category = sub || (filter !== 'all' ? filter : '');
  if (category) params.category = category;
  try {
    const data = await MaisonApi.getProducts(params);
    await ld.end();
    if (seq !== loadSeq) return; // a newer request replaced this one
    const pg = data.pagination;
    page = pg.page; // the server clamps out-of-range pages
    setUrl();
    const list = data.products.map(apiProductToCard);
    grid.innerHTML = list.map(p => card(view(p))).join('');
    const from = (pg.page - 1) * pg.per_page + 1;
    count.textContent = pg.total ? `Showing ${from}-${from + list.length - 1} of ${pg.total} product${pg.total === 1 ? '' : 's'}` : '0 products';
    empty.textContent = emptyText; empty.hidden = list.length > 0;
    renderPager(pager, pg, n => { page = n; setUrl(); load(true); });
    grid.querySelectorAll('.ph img').forEach(img => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });
    observeReveals();
    if (scrollToTop) $('.toolbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    await ld.end();
    if (seq !== loadSeq) return;
    grid.innerHTML = Ui.errorBox(error, { title: 'We could not load the products' }); count.textContent = ''; pager.hidden = true; empty.hidden = true;
    Ui.onRetry(grid, () => load());
  } finally {
    if (seq === loadSeq) { grid.removeAttribute('aria-busy'); grid.style.opacity = ''; }
  }
}

chips.forEach(c => c.addEventListener('click', () => { filter = c.dataset.filter; sub = ''; page = 1; setUrl(); renderChips(); load(); }));
sortSel.addEventListener('change', () => { page = 1; load(); });

// The category tree (with product counts) drives the sub-category chips; load it first so an invalid ?sub= is dropped.
MaisonApi.getCategories().then(d => { tree = d.categories || []; }).catch(() => { tree = null; }).then(() => {
  if (tree && sub && !tree.some(c => c.slug === sub && c.parent_slug === filter)) sub = '';
  renderChips();
  load();
});
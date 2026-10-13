/* Shop page. Server-side pagination: each request asks the API for one page of the current category / sub-category / sort.
   Uses helpers from script.js and products.js. URL: ?category=perfume&sub=attar-oil&page=2 */
if (typeof PRODUCTS === 'undefined') throw new Error('shop.js needs products.js loaded first: add <script src="./assets/js/products.js"></script> before shop.js in shop.html.');

const PER_PAGE = 12;
const grid = $('#shopGrid'), count = $('#count'), empty = $('#empty'), sortSel = $('#sort'), subBar = $('#subFilters'), pager = $('#pager');
const filtersEl = document.querySelector('.filters'); // top-level category chips: rebuilt from the API once the category tree arrives
const emptyText = empty.textContent;
const qs = new URLSearchParams(location.search);
let filter = qs.get('category') || 'all'; // validated against the server's categories once they load
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

const nameOf = slug => ((tree && tree.find(c => c.slug === slug)) || {}).name || LABELS[slug] || slug;

function renderChips() {
  if (tree && filtersEl) { // every active top-level category from the server, including ones added in Admin
    const tops = tree.filter(c => !c.parent_slug);
    filtersEl.innerHTML = [{ slug: 'all', name: 'All' }, ...tops].map(c => `<button class="chip" type="button" data-filter="${Ui.esc(c.slug)}" aria-pressed="${c.slug === filter}">${Ui.esc(c.name)}</button>`).join('');
  }
  const subs = filter === 'all' || !tree ? [] : tree.filter(c => c.parent_slug === filter).map(c => ({ slug: c.slug, name: c.name, order: c.sort_order, count: c.product_count }));
  const top = tree && tree.find(c => c.slug === filter);
  renderSubFilters(subBar, subs, sub, filter === 'all' ? 'All' : `All ${nameOf(filter)}`, top ? top.product_count : 0, picked => { sub = picked; page = 1; setUrl(); load(); });
  filtersEl.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.filter === filter));
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

filtersEl.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; filter = c.dataset.filter; sub = ''; page = 1; setUrl(); renderChips(); load(); });
sortSel.addEventListener('change', () => { page = 1; load(); });

// The category tree (with product counts) drives the sub-category chips; load it first so an invalid ?sub= is dropped.
MaisonApi.getCategories().then(d => { tree = d.categories || []; }).catch(() => { tree = null; }).then(() => {
  if (tree) { if (filter !== 'all' && !tree.some(c => !c.parent_slug && c.slug === filter)) { filter = 'all'; sub = ''; } }
  else if (!LABELS[filter]) filter = 'all'; // categories could not be loaded: fall back to the three built-in chips
  if (tree && sub && !tree.some(c => c.slug === sub && c.parent_slug === filter)) sub = '';
  renderChips();
  load();
});

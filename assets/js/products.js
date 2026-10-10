/* Shared product data (shop + product pages). API data replaces these placeholders when available.
   id: unique, URL-safe. type: perfume | skincare | makeup. price: number in naira or null.
   image: card image path; images: gallery paths (optional). notes: perfume only. */
const LABELS = { perfume: 'Perfume', skincare: 'Skincare', makeup: 'Makeup' };
let PRODUCTS = ['perfume', 'skincare', 'makeup'].flatMap(type =>
  [1, 2, 3, 4].map(n => ({
    id: `${type}-${n}`, type, category: LABELS[type], name: `[${LABELS[type].toUpperCase()} NAME ${n}]`,
    desc: '[PRODUCT DESCRIPTION]', price: null, image: '', images: [],
    notes: type === 'perfume' ? { top: '[FRAGRANCE NOTES]', heart: '[FRAGRANCE NOTES]', base: '[FRAGRANCE NOTES]' } : null,
    details: '[PRODUCT DETAILS — size, usage and other specifics.]'
  }))
);
const money = n => '₦' + n.toLocaleString('en-NG');
const view = p => ({ ...p, category: p.subcategory || p.category, price: p.price == null ? '[PRICE]' : money(p.price) });

/* Subcategories present in a list of products, in the order set in Admin. */
function subcategoriesOf(list) {
  const map = new Map();
  list.forEach(p => {
    if (!p.subtype) return;
    const s = map.get(p.subtype) || { slug: p.subtype, name: p.subcategory, order: p.subOrder, count: 0 };
    s.count++; map.set(p.subtype, s);
  });
  return [...map.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/* Draws the subcategory chips (with an "All" chip first). Hidden when there are none. */
function renderSubFilters(el, subs, active, allLabel, total, onPick) {
  if (!el) return;
  el.hidden = subs.length === 0;
  el.innerHTML = subs.length ? [{ slug: '', name: allLabel, count: total }, ...subs].map(s =>
    `<button class="chip chip-sub" type="button" data-sub="${esc(s.slug)}" aria-pressed="${s.slug === active}">${esc(s.name)} <span class="chip-count">${s.count}</span></button>`).join('') : '';
  el.onclick = e => { const b = e.target.closest('[data-sub]'); if (b) onPick(b.dataset.sub); };
}

function apiProductToCard(p) {
  const leaf = p.category?.slug || 'perfume';
  const parent = p.category?.parent || null;
  const type = parent?.slug || leaf; // top-level category: perfume | skincare | makeup
  const details = p.details || {};
  const gallery = Array.isArray(p.images) ? p.images.map(img => img.url || img.image_url).filter(Boolean) : [];
  return {
    id: p.slug || String(p.id),
    apiId: p.id,
    type,
    category: parent?.name || p.category?.name || LABELS[type] || 'Product',
    subtype: parent ? leaf : '',
    subcategory: parent ? (p.category?.name || '') : '',
    subOrder: Number(p.category?.sort_order || 0),
    name: p.name,
    desc: p.short_description || p.description || '',
    fullDesc: p.full_description || details.full_description || p.description || '',
    price: p.price == null ? null : Number(p.price),
    compareAtPrice: p.compare_at_price == null ? null : Number(p.compare_at_price),
    image: p.image_url || '',
    images: [p.image_url, ...gallery].filter(Boolean),
    stock: Number(p.stock_quantity || 0),
    status: p.status || (Number(p.stock_quantity || 0) > 0 ? 'active' : 'out_of_stock'),
    featured: Boolean(p.featured),
    notes: details.notes || null,
    details: details.copy || details.details || p.full_description || '',
    specifications: Array.isArray(p.specifications) ? p.specifications : []
  };
}

async function loadProductsFromApi(params = {}) {
  if (!window.MaisonApi) return PRODUCTS;
  try {
    const data = await MaisonApi.getProducts(params);
    if (Array.isArray(data.products)) {
      PRODUCTS = data.products.map(apiProductToCard);
      document.dispatchEvent(new CustomEvent('maison:products', { detail: { products: PRODUCTS } }));
    }
  } catch (error) {
    console.warn(error.message || error);
  }
  return PRODUCTS;
}

loadProductsFromApi();
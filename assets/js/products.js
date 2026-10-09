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
const view = p => ({ ...p, price: p.price == null ? '[PRICE]' : money(p.price) });

function apiProductToCard(p) {
  const type = p.category?.slug || 'perfume';
  const details = p.details || {};
  const gallery = Array.isArray(p.images) ? p.images.map(img => img.url || img.image_url).filter(Boolean) : [];
  return {
    id: p.slug || String(p.id),
    apiId: p.id,
    type,
    category: p.category?.name || LABELS[type] || 'Product',
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

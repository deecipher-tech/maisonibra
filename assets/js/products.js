/* Shared product data (shop + product pages). Replace placeholders with real data.
   id: unique, URL-safe. type: perfume | skincare | makeup. price: number in naira or null.
   image: card image path; images: gallery paths (optional). notes: perfume only. */
const LABELS = { perfume: 'Perfume', skincare: 'Skincare', makeup: 'Makeup' };
const PRODUCTS = ['perfume', 'skincare', 'makeup'].flatMap(type =>
  [1, 2, 3, 4].map(n => ({
    id: `${type}-${n}`, type, category: LABELS[type], name: `[${LABELS[type].toUpperCase()} NAME ${n}]`,
    desc: '[PRODUCT DESCRIPTION]', price: null, image: '', images: [],
    notes: type === 'perfume' ? { top: '[FRAGRANCE NOTES]', heart: '[FRAGRANCE NOTES]', base: '[FRAGRANCE NOTES]' } : null,
    details: '[PRODUCT DETAILS — size, usage and other specifics.]'
  }))
);
const money = n => '₦' + n.toLocaleString('en-NG');
const view = p => ({ ...p, price: p.price == null ? '[PRICE]' : money(p.price) });
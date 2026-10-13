/* Product detail page. Loads the selected product from the public API by slug. */
(async function () {
  const root = $('#productRoot');
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') || params.get('id');

  if (!slug) {
    renderEmpty('Product not found', 'Choose a product from the shop.');
    return;
  }

  async function load() {
  const ld = Ui.loading(root, Ui.sk.pdp(), { reserve: false, delay: 120 });
  try {
    let product;
    if (window.MaisonApi?.getProduct) {
      const data = await MaisonApi.getProduct(slug);
      product = apiProductToCard(data.product);
    } else {
      await loadProductsFromApi({ slug });
      product = PRODUCTS.find(x => x.id === slug);
    }

    await ld.end();
    if (!product) {
      renderEmpty('Product not found', 'This product may have moved or no longer exists.');
      return;
    }

    renderProduct(product);
  } catch (error) {
    await ld.end();
    if (error.status === 404) renderEmpty('Product not found', 'This product may have moved or no longer exists.');
    else { root.innerHTML = Ui.errorBox(error, { title: 'We could not load this product' }); }
  } finally { root.removeAttribute('aria-busy'); }
  }
  Ui.onRetry(root, load);
  load();

  function renderEmpty(title, message) {
    root.innerHTML = `<div class="pdp-empty"><h1>${esc(title)}</h1><p>${esc(message)}</p><a class="btn btn-dark" href="shop.html">Back to shop</a></div>`;
  }

  function renderProduct(p) {
    document.title = `${p.name} | MAISON IBRA`;
    const slides = p.images.length ? p.images : [p.image].filter(Boolean);
    const total = Math.max(slides.length, 1);
    const slot = i => slides[i] ? `<img src="${esc(slides[i])}" alt="${esc(p.name)}, view ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">` : `<span>[PRODUCT IMAGE]</span>`;
    const dropBroken = el => el.querySelectorAll('img').forEach(img => { const d = () => img.remove(); img.addEventListener('error', d); if (img.complete && !img.naturalWidth) d(); });
    const price = p.compareAtPrice ? `<span class="old-price">${esc(view({ ...p, price: p.price }).price)}</span> ${esc(view({ ...p, price: p.compareAtPrice }).price)}` : esc(view(p).price);
    const specs = p.specifications?.length ? `<details open><summary>Specifications</summary><dl class="notes">${p.specifications.map(s => `<div><dt>${esc(s.key)}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl></details>` : '';
    const out = p.status === 'out_of_stock' || p.stock <= 0;

    root.innerHTML = `
      <nav class="pcrumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><a href="shop.html">Shop</a><span aria-hidden="true">/</span><a href="shop.html?category=${esc(p.type)}">${esc(p.category)}</a>${p.subcategory ? `<span aria-hidden="true">/</span><a href="shop.html?category=${esc(p.type)}&sub=${esc(p.subtype)}">${esc(p.subcategory)}</a>` : ''}<span aria-hidden="true">/</span><span aria-current="page">${esc(p.name)}</span></nav>
      <div class="pdp">
        <div class="gallery">
          <div class="ph ph-card" id="mainImg">${slot(0)}</div>
          <div class="thumbs">${Array.from({ length: total }, (_, i) => `<button class="thumb" type="button" data-i="${i}" aria-label="Show image ${i + 1}" aria-current="${i === 0}"><span class="ph">${slides[i] ? `<img src="${esc(slides[i])}" alt="" loading="lazy">` : `<span>${i + 1}</span>`}</span></button>`).join('')}</div>
        </div>
        <div class="pinfo">
          <p class="label">${esc(p.subcategory ? `${p.category} · ${p.subcategory}` : p.category)}</p>
          <h1>${esc(p.name)}</h1>
          <p class="pprice">${price}</p>
          <p class="pdesc">${esc(p.fullDesc || p.desc)}</p>
          <p class="stock-line">${out ? 'Out of stock' : `${p.stock} available`}</p>
          <div class="buy">
            <div class="qty" role="group" aria-label="Quantity"><button type="button" data-step="-1" aria-label="Decrease quantity">-</button><output id="qty" aria-live="polite">1</output><button type="button" data-step="1" aria-label="Increase quantity">+</button></div>
            <button class="btn" type="button" id="addBtn" ${out ? 'disabled' : ''}>${out ? 'Out of stock' : 'Add to bag'}</button>
            <button class="btn-icon" type="button" id="wishBtn" aria-pressed="false" aria-label="Add to wishlist">${heart}</button>
          </div>
          <div class="accordion">${specs}
            <details open><summary>Product details</summary><p>${esc(p.fullDesc || p.details || p.desc)}</p></details>
            <details><summary>Delivery &amp; returns</summary><p id="pdpDelivery"><span class="sk sk-line w80"></span></p><p><a href="shipping.html">Shipping</a> &middot; <a href="returns.html">Returns</a></p></details>
          </div>
        </div>
      </div>`;
    dropBroken(root);

    const main = $('#mainImg');
    root.querySelectorAll('.thumb').forEach(t => t.addEventListener('click', () => {
      main.innerHTML = slot(+t.dataset.i); dropBroken(main);
      root.querySelectorAll('.thumb').forEach(x => x.setAttribute('aria-current', x === t));
    }));
    let qty = 1; const outQty = $('#qty');
    root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { qty = Math.min(Math.max(p.stock || 1, 1), Math.max(1, qty + +b.dataset.step)); outQty.textContent = qty; }));
    $('#addBtn')?.addEventListener('click', () => { if (!out) addToBag(p.name, qty, p.apiId); });
    $('#wishBtn').addEventListener('click', e => {
      const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      e.currentTarget.setAttribute('aria-pressed', on);
      e.currentTarget.setAttribute('aria-label', on ? 'Remove from wishlist' : 'Add to wishlist');
      showToast(on ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
    });

    MaisonApi.getStore().then(d => { const s = d.store || {}; const el = $('#pdpDelivery'); if (el) el.textContent = Ui.deliverySentence((s.settings || {}).delivery, s.currency) + ((s.settings || {}).delivery && s.settings.delivery.estimate ? ' ' + s.settings.delivery.estimate : ''); })
      .catch(() => { const el = $('#pdpDelivery'); if (el) el.textContent = 'Delivery details are shown at checkout.'; });

    loadRelated(p);
  }

  /* "You may also like": fetched on its own so it never depends on what else happened to be loaded into PRODUCTS.
     Order of preference: same sub-category, then same top-level category, then anything in the store. */
  async function loadRelated(p) {
    const section = $('#related'), grid = $('#relatedGrid');
    const picked = [], seen = new Set([p.id]);
    const reveal = setTimeout(() => { section.hidden = false; }, 150); // only show the placeholder row if the wait is noticeable
    const ld = Ui.loading(grid, Ui.sk.cards(4), { delay: 150 });
    const take = data => (data.products || []).map(apiProductToCard).forEach(x => {
      if (picked.length < 4 && !seen.has(x.id)) { seen.add(x.id); picked.push(x); }
    });
    try {
      if (p.subtype) take(await MaisonApi.getProducts({ category: p.subtype, page: 1, per_page: 8 }));
      if (picked.length < 4) take(await MaisonApi.getProducts({ category: p.type, page: 1, per_page: 12 }));
      if (picked.length < 4) take(await MaisonApi.getProducts({ page: 1, per_page: 12 }));
    } catch (error) {
      console.warn(error.message || error);
    }
    clearTimeout(reveal);
    await ld.end();
    if (!picked.length) { section.hidden = true; return; }
    grid.innerHTML = picked.map(x => card(view(x))).join('');
    section.hidden = false;
    grid.querySelectorAll('.ph img').forEach(img => { const d = () => img.remove(); img.addEventListener('error', d); if (img.complete && !img.naturalWidth) d(); });
    observeReveals();
  }
})();
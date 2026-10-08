/* Product detail page. Uses helpers from script.js and data from products.js. */
(function () {
  const root = $('#productRoot');
  const p = PRODUCTS.find(x => x.id === new URLSearchParams(location.search).get('id'));
  if (!p) {
    root.innerHTML = '<div class="pdp-empty"><h1>Product not found</h1><p>This product may have moved or no longer exists.</p><a class="btn btn-dark" href="shop.html">Back to shop</a></div>';
    return;
  }
  document.title = `${p.name} | MAISON IBRA`;
  const slides = p.images.length ? p.images : [p.image].filter(Boolean);
  const total = Math.max(slides.length, 3);
  const slot = i => slides[i] ? `<img src="${esc(slides[i])}" alt="${esc(p.name)}, view ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">` : `<span>[PRODUCT IMAGE ${i + 1}]</span>`;
  const dropBroken = el => el.querySelectorAll('img').forEach(img => { const d = () => img.remove(); img.addEventListener('error', d); if (img.complete && !img.naturalWidth) d(); });
  const price = view(p).price;
  const notes = p.notes ? `<details open><summary>Fragrance notes</summary><dl class="notes"><div><dt>Top notes</dt><dd>${esc(p.notes.top)}</dd></div><div><dt>Heart notes</dt><dd>${esc(p.notes.heart)}</dd></div><div><dt>Base notes</dt><dd>${esc(p.notes.base)}</dd></div></dl></details>` : '';

  root.innerHTML = `
    <nav class="pcrumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><a href="shop.html">Shop</a><span aria-hidden="true">/</span><a href="shop.html?category=${p.type}">${esc(p.category)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.name)}</span></nav>
    <div class="pdp">
      <div class="gallery">
        <div class="ph ph-card" id="mainImg">${slot(0)}</div>
        <div class="thumbs">${Array.from({ length: total }, (_, i) => `<button class="thumb" type="button" data-i="${i}" aria-label="Show image ${i + 1}" aria-current="${i === 0}"><span class="ph">${slides[i] ? `<img src="${esc(slides[i])}" alt="" loading="lazy">` : `<span>${i + 1}</span>`}</span></button>`).join('')}</div>
      </div>
      <div class="pinfo">
        <p class="label">${esc(p.category)}</p>
        <h1>${esc(p.name)}</h1>
        <p class="pprice">${esc(price)}</p>
        <p class="pdesc">${esc(p.desc)}</p>
        <div class="buy">
          <div class="qty" role="group" aria-label="Quantity"><button type="button" data-step="-1" aria-label="Decrease quantity">−</button><output id="qty" aria-live="polite">1</output><button type="button" data-step="1" aria-label="Increase quantity">+</button></div>
          <button class="btn" type="button" id="addBtn">Add to bag</button>
          <button class="btn-icon" type="button" id="wishBtn" aria-pressed="false" aria-label="Add to wishlist">${heart}</button>
        </div>
        <div class="accordion">${notes}
          <details><summary>Product details</summary><p>${esc(p.details)}</p></details>
          <details><summary>Delivery &amp; returns</summary><p>Complimentary delivery on orders above ₦150,000. [DELIVERY &amp; RETURNS DETAILS]</p></details>
        </div>
      </div>
    </div>`;
  dropBroken(root);

  const main = $('#mainImg');
  root.querySelectorAll('.thumb').forEach(t => t.addEventListener('click', () => {
    main.innerHTML = slot(+t.dataset.i); dropBroken(main);
    root.querySelectorAll('.thumb').forEach(x => x.setAttribute('aria-current', x === t));
  }));
  let qty = 1; const out = $('#qty');
  root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { qty = Math.min(10, Math.max(1, qty + +b.dataset.step)); out.textContent = qty; }));
  $('#addBtn').addEventListener('click', () => addToBag(p.name, qty));
  $('#wishBtn').addEventListener('click', e => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', on);
    e.currentTarget.setAttribute('aria-label', on ? 'Remove from wishlist' : 'Add to wishlist');
    showToast(on ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
  });

  const rel = PRODUCTS.filter(x => x.id !== p.id).sort((a, b) => (b.type === p.type) - (a.type === p.type)).slice(0, 4);
  $('#relatedGrid').innerHTML = rel.map(x => card(view(x))).join('');
  $('#related').hidden = false;
  dropBroken($('#relatedGrid'));
  observeReveals();
})();
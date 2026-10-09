/* Applies Admin settings (ibra_settings) and Storefront edits (ibra_site) to the public pages.
   Load after script.js. Everything here is optional: missing data or elements are skipped. */
(function () {
  const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const S = read('ibra_settings'), C = read('ibra_site'), g = S.general || {}, con = S.contact || {}, soc = S.social || {};
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const text = (sel, v) => { const n = $(sel); if (n && v) n.textContent = v; };
  const get = (p) => p.split('.').reduce((a, k) => a?.[k], C);

  /* Platform status */
  if (g.status === 'off' && !sessionStorage.getItem('ibra_session')) {
    const m = document.createElement('div'); m.className = 'maint'; m.setAttribute('role', 'alert');
    m.innerHTML = `<h1>${e(g.appName || 'MAISON IBRA')}</h1><p>We are updating the store and will be back soon.</p>`;
    document.body.append(m); document.body.classList.add('is-off');
  }

  /* Brand */
  if (g.favicon) { let l = $('link[rel~=icon]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.append(l); } l.href = g.favicon; }
  if (g.logo) { const i = $('.logo img'); if (i) i.src = g.logo; }
  if (g.appName) { text('.logo-text', g.appName); const c = $('.copy'); if (c) c.textContent = `© ${new Date().getFullYear()} ${g.appName}. All Rights Reserved.`; }
  text('.announce', get('announce'));

  /* Socials and contact details */
  $$('.footer a[data-soon], .follow a[data-soon]').forEach(a => {
    const url = soc[a.textContent.trim().toLowerCase()];
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.removeAttribute('data-soon'); }
  });
  const map = { Email: con.email, 'Phone / WhatsApp': con.phone || con.whatsapp, Visit: con.address, Hours: con.hours };
  $$('.contact-info dl div').forEach(d => { const v = map[$('dt', d)?.textContent]; if (v) $('dd', d).textContent = v; });

  /* Home page content */
  if (!$('#signatureGrid')) return;
  const h = C.hero || {};
  if (h.title || h.gold) $('#h-hero').innerHTML = `${e(h.title || '')} <span class="gold-text">${e(h.gold || '')}</span>`;
  text('.hero-text', h.text); text('.hero-cta .btn', h.cta1); text('.hero-cta .link-light', h.cta2);
  const setImg = (host, src, alt) => { if (!src || !host) return; let i = $('img', host); if (!i) { i = document.createElement('img'); i.alt = alt; host.append(i); } i.src = src; };
  $$('.hero-tiles .tile').forEach((t, n) => setImg(t, h['img' + (n + 1)], ['Perfume', 'Skincare', 'Makeup'][n]));
  text('#h-collection', get('collection.title')); text('#collection .sec-head p', get('collection.sub'));
  text('#h-beauty', get('beauty.title')); text('#beauty .sec-head p', get('beauty.sub'));
  $$('#catGrid .cat').forEach((c, n) => { const k = C['cat' + (n + 1)] || {}; if (k.title) $('h3', c).textContent = k.title; if (k.line) $('p', c).textContent = k.line; setImg($('.ph', c), k.img, k.title || ''); });
  const st = C.statement || {};
  if (st.line1 || st.gold) $('.statement blockquote p').innerHTML = `“${e(st.line1 || '')}<br>${e(st.line2 || '')} <span class="gold-text">${e(st.gold || '')}</span>”`;
  text('.statement > p', st.text);
  text('#h-story', get('story.title')); text('.story-copy p', get('story.text')); setImg($('.story .ph'), get('story.img'), 'MAISON IBRA');
  text('#h-journal', get('journal.title')); text('#h-news', get('news.title')); text('.newsletter > p', get('news.text'));

  /* Product sections: use products saved in Admin when they exist, and respect the maximum */
  let prods = null; try { prods = JSON.parse(localStorage.getItem('ibra_admin_products')); } catch (x) {}
  const cur = g.currency || '₦', LAB = { perfume: 'Perfume', skincare: 'Skincare', makeup: 'Makeup' };
  const toCard = p => ({ id: p.id, name: p.name, category: LAB[p.type], desc: p.desc, image: p.image, price: p.price == null ? '[PRICE]' : cur + Number(p.price).toLocaleString('en-NG') });
  const section = (sel, list, max) => {
    const grid = $(sel); if (!grid) return;
    if (Array.isArray(prods)) grid.innerHTML = list.slice(0, max).map(p => card(toCard(p))).join('');
    else $$('.card', grid).slice(max).forEach(c => c.remove());
    $$('.ph img', grid).forEach(i => i.addEventListener('error', () => i.remove()));
    observeReveals();
  };
  const active = (Array.isArray(prods) ? prods : []).filter(p => p.status === 'active');
  section('#signatureGrid', active.filter(p => p.type === 'perfume'), get('collection.max') || 4);
  section('#beautyGrid', active.filter(p => p.type !== 'perfume'), get('beauty.max') || 4);
  $$('#journalGrid .post').slice(get('journal.max') || 3).forEach(p => p.remove());
})();
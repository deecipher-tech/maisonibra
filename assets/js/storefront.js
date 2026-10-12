/* Storefront content from the database (Admin > Storefront). Load this LAST on every public page.

   public/store returns `storefront` (global, home, about, contact). This file writes it into the page:
   announcement bar, menu, newsletter and footer on every page, then the sections of the page it is on.
   The last answer is cached in localStorage and painted immediately on the next visit, then refreshed from the
   server, so edited text does not flash the old version. Everything is escaped before it is inserted. */
(function () {
  'use strict';
  if (!window.MaisonApi) return;

  const CACHE_KEY = 'maison_storefront_v1';
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isExternal = u => /^https?:\/\//i.test(u || '');
  const targetAttr = u => (isExternal(u) ? ' target="_blank" rel="noopener"' : '');
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; }; // style, not [hidden]: many sections set display themselves
  const text = (el, v) => { if (el) el.textContent = v == null ? '' : v; };
  const withGold = (title, gold) => esc(title) + (gold ? ` <span class="gold-text">${esc(gold)}</span>` : '');
  const paragraphs = (value, cls) => String(value || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    .map(s => `<p class="${cls}">${esc(s).replace(/\n/g, '<br>')}</p>`).join('');
  const refresh = () => { if (typeof observeReveals === 'function') observeReveals(); };

  function dropBroken(root) {
    qa('.ph img', root).forEach(img => { const d = () => img.remove(); img.addEventListener('error', d); if (img.complete && !img.naturalWidth) d(); });
  }

  /* A link-like element: hidden when it has no address or no label. */
  function setLink(a, url, label) {
    if (!a) return;
    if (label !== undefined) a.textContent = label;
    const on = !!url && !!a.textContent.trim();
    show(a, on);
    if (!on) return;
    a.setAttribute('href', url);
    a.removeAttribute('data-soon');
    if (isExternal(url)) { a.target = '_blank'; a.rel = 'noopener'; } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
  }

  /* Puts (or removes) the <img> inside a tile / placeholder box. */
  function setImage(host, src, alt) {
    if (!host) return;
    let img = q('img', host);
    if (!src) { if (img) img.remove(); return; }
    if (!img) {
      img = document.createElement('img');
      img.loading = 'lazy'; img.decoding = 'async';
      const anchor = q('a', host);
      anchor ? host.insertBefore(img, anchor) : host.append(img);
    }
    img.alt = alt || '';
    if (img.getAttribute('src') !== src) img.src = src;
    img.onerror = () => img.remove();
  }

  function setSeo(seo) {
    if (!seo) return;
    if (seo.title) document.title = seo.title;
    const meta = q('meta[name="description"]');
    if (seo.description && meta) meta.setAttribute('content', seo.description);
  }

  /* ------------------------------------------------------------ shared by every page */
  const fileOf = u => String(u || '').split('#')[0].split('?')[0].split('/').pop();

  function applyNav(nav) {
    const here = location.pathname.split('/').pop() || 'index.html';
    const html = (nav || []).map(l => {
      const current = !/[#?]/.test(l.url || '') && fileOf(l.url) && fileOf(l.url) === here;
      return `<a href="${esc(l.url || '#')}"${targetAttr(l.url)}${current ? ' aria-current="page"' : ''}>${esc(l.label)}</a>`;
    }).join('');
    qa('.nav-center').forEach(n => { n.innerHTML = html; });
    qa('.drawer-panel').forEach(p => { // keep the close button, replace the links
      qa('a', p).forEach(a => a.remove());
      p.insertAdjacentHTML('beforeend', html.replace(' aria-current="page"', ''));
    });
  }

  function applyNewsletter(n) {
    if (!n) return;
    qa('.newsletter').forEach(sec => {
      show(sec, n.visible !== false);
      text(q('h2', sec), n.title);
      const p = q(':scope > p', sec); text(p, n.text); show(p, !!n.text);
      const input = q('input[type=email]', sec); if (input) input.placeholder = n.placeholder || '';
      text(q('button[type=submit]', sec), n.button);
      const note = q('small', sec); text(note, n.note); show(note, !!n.note);
    });
  }

  function footerLink(l, social) {
    let url = l.url;
    if (!url) { // Instagram / TikTok / Facebook / X without an address use the links saved in Admin > Settings > Social
      const key = String(l.label || '').trim().toLowerCase();
      url = social[key] || (key === 'twitter' ? social.x : '') || '';
    }
    return url
      ? `<a href="${esc(url)}"${targetAttr(url)}>${esc(l.label)}</a>`
      : `<a href="#top" data-soon="${esc(l.label)} is coming soon.">${esc(l.label)}</a>`;
  }

  function applyFooter(f, social, name) {
    if (!f) return;
    qa('.foot-grid').forEach(grid => {
      grid.innerHTML = (f.columns || []).map(col => `<div><h3>${esc(col.title)}</h3>${(col.links || []).map(l => footerLink(l, social)).join('')}</div>`).join('');
    });
    const brand = name || (q('.logo-text') || {}).textContent || 'MAISON IBRA';
    qa('.copy').forEach(c => {
      c.textContent = (f.copyright || '© {year} {name}. All Rights Reserved.').replace(/\{year\}/g, new Date().getFullYear()).replace(/\{name\}/g, brand);
    });
  }

  function applyGlobal(g, data) {
    if (!g) return;
    qa('.announce').forEach(el => { text(el, g.announce); show(el, !!g.announce); });
    applyNav(g.nav);
    applyNewsletter(g.newsletter);
    applyFooter(g.footer, (data.settings || {}).social || {}, data.name);
  }

  /* ------------------------------------------------------------ a "feature" block (home signature scent, about philosophy / craft) */
  function renderFeature(sec, d, titleSel) {
    if (!sec || !d) return;
    show(sec, d.visible !== false && !!(d.title || d.text));
    const label = q('.label', sec); text(label, d.label); show(label, !!d.label);
    const title = q(titleSel, sec); text(title, d.title);
    qa('.lead', sec).forEach(x => x.remove());
    if (title && d.text) title.insertAdjacentHTML('afterend', paragraphs(d.text, 'lead'));
    const notes = q('.notes', sec);
    if (notes) {
      const list = (d.notes || []).filter(n => n.label || n.value);
      notes.innerHTML = list.map(n => `<div><dt>${esc(n.label)}</dt><dd>${esc(n.value)}</dd></div>`).join('');
      show(notes, list.length > 0);
    }
    const price = q('.price', sec); if (price) { text(price, d.price); show(price, !!d.price); }
    const btn = q('.btn', sec); if (btn) setLink(btn, d.button_url, d.button_text);
    const ph = q('.ph', sec);
    if (ph) { const ghost = q('span', ph); if (ghost) ghost.remove(); ph.setAttribute('aria-label', d.title || ''); setImage(ph, d.image, d.title); }
  }

  /* ------------------------------------------------------------ products for the home sections */
  const productCache = new Map();
  function sectionProducts(category, max) {
    const key = category + '|' + max;
    if (!productCache.has(key)) {
      const slugs = String(category || '').split(',').map(s => s.trim()).filter(Boolean);
      const lists = (slugs.length ? slugs : ['']).map(slug =>
        MaisonApi.getProducts(Object.assign({ page: 1, per_page: max }, slug ? { category: slug } : {}))
          .then(d => (d.products || []).map(apiProductToCard)).catch(() => []));
      productCache.set(key, Promise.all(lists).then(all => { // several categories are interleaved so each is represented
        const out = [], seen = new Set();
        for (let i = 0; out.length < max && all.some(l => i < l.length); i++) {
          all.forEach(l => { const p = l[i]; if (p && out.length < max && !seen.has(p.id)) { seen.add(p.id); out.push(p); } });
        }
        return out;
      }));
    }
    return productCache.get(key);
  }

  let token = 0;
  async function fillProducts(gridSel, secSel, cfg) {
    const grid = q(gridSel), sec = q(secSel);
    if (!grid || !sec) return;
    show(sec, cfg.visible !== false);
    if (cfg.visible === false) return;
    const mine = grid._sfToken = ++token;
    const list = await sectionProducts(cfg.category, cfg.max || 4);
    if (grid._sfToken !== mine) return; // a newer render replaced this one
    grid.innerHTML = list.map(p => card(view(p))).join('');
    show(sec, list.length > 0);
    dropBroken(grid); refresh();
  }

  /* ------------------------------------------------------------ pages */
  function renderHome(h) {
    setSeo(h.seo);
    const hero = h.hero || {};
    const title = q('#h-hero'); if (title) title.innerHTML = withGold(hero.title, hero.gold);
    text(q('.hero-text'), hero.text);
    setLink(q('.hero-cta .btn'), hero.cta1_url, hero.cta1_text);
    setLink(q('.hero-cta .link-light'), hero.cta2_url, hero.cta2_text);
    qa('.hero-tiles .tile').forEach((tile, i) => {
      const t = (hero.tiles || [])[i];
      show(tile, !!t);
      if (!t) return;
      const a = q('a', tile);
      if (a) { a.setAttribute('href', t.url || '#'); a.setAttribute('aria-label', t.alt || t.label || ''); }
      text(q('.tile-label', tile), t.label);
      setImage(tile, t.image, t.alt);
    });

    const col = h.collection || {};
    text(q('#h-collection'), col.title);
    const colSub = q('#collection .sec-head p'); text(colSub, col.subtitle); show(colSub, !!col.subtitle);
    fillProducts('#signatureGrid', '#collection', col);

    const cats = h.categories || {}, items = cats.items || [];
    show(q('#categories'), cats.visible !== false && items.length > 0);
    const catGrid = q('#catGrid');
    if (catGrid) {
      catGrid.innerHTML = items.map(c => `<a class="cat" href="${esc(c.url || '#')}"${targetAttr(c.url)} aria-label="Explore ${esc(c.title)}"><div class="ph">${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.title)} collection" loading="lazy" decoding="async">` : ''}</div><div><h3>${esc(c.title)}</h3><p>${esc(c.line)}</p>${c.link_text ? `<span class="link-light">${esc(c.link_text)}</span>` : ''}</div></a>`).join('');
      dropBroken(catGrid);
    }

    const st = h.statement || {};
    show(q('.statement'), st.visible !== false);
    const quote = q('.statement blockquote p');
    if (quote) quote.innerHTML = `“${esc(st.line1)}<br>${esc(st.line2)}${st.gold ? ` <span class="gold-text">${esc(st.gold)}</span>` : ''}”`;
    const stText = q('.statement > p'); text(stText, st.text); show(stText, !!st.text);

    renderFeature(q('section.feature[aria-labelledby="h-feature"]'), h.feature, '#h-feature');

    const beauty = h.beauty || {};
    text(q('#h-beauty'), beauty.title);
    const beautySub = q('#beauty .sec-head p'); text(beautySub, beauty.subtitle); show(beautySub, !!beauty.subtitle);
    fillProducts('#beautyGrid', '#beauty', beauty);

    const story = h.story || {};
    show(q('#story'), story.visible !== false && !!(story.text || story.image));
    text(q('#h-story'), story.title);
    const storyText = q('.story-copy p'); text(storyText, story.text); show(storyText, !!story.text);
    setLink(q('.story-copy .btn'), story.button_url, story.button_text);
    const storyPh = q('.story .ph');
    if (storyPh) { const ghost = q('span', storyPh); if (ghost) ghost.remove(); show(storyPh, !!story.image); setImage(storyPh, story.image, story.title); }

    const journal = h.journal || {}, posts = journal.posts || [];
    show(q('#journal'), journal.visible !== false && posts.length > 0);
    text(q('#h-journal'), journal.title);
    const jg = q('#journalGrid');
    if (jg) {
      jg.innerHTML = posts.map(p => `<article class="post reveal"><div class="ph" role="img" aria-label="${esc(p.title)}">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : ''}</div><p class="post-meta">${esc([p.category, p.date].filter(Boolean).join(' | '))}</p><h3>${esc(p.title)}</h3>${p.url ? `<a class="read" href="${esc(p.url)}"${targetAttr(p.url)}>${esc(p.link_text || 'Read article')}</a>` : ''}</article>`).join('');
      dropBroken(jg);
    }
    refresh();
  }

  function renderAbout(a) {
    setSeo(a.seo);
    renderFeature(q('section.feature[aria-labelledby="h-phil"]'), a.philosophy, '#h-phil');

    const v = a.values || {}, vs = q('section[aria-labelledby="h-values"]');
    show(vs, v.visible !== false);
    const vt = q('#h-values'); if (vt) vt.innerHTML = withGold(v.title, v.gold);
    const intro = q('.sec-head p', vs); text(intro, v.intro); show(intro, !!v.intro);
    const ul = q('.values');
    if (ul) ul.innerHTML = (v.items || []).map((it, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span><h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ''}</li>`).join('');

    renderFeature(q('section.feature[aria-labelledby="h-craft"]'), a.craft, '#h-craft');

    const c = a.cta || {};
    show(q('.cta-band'), c.visible !== false);
    const ct = q('#h-cta'); if (ct) ct.innerHTML = withGold(c.title, c.gold);
    const cp = q('.cta-band p'); text(cp, c.text); show(cp, !!c.text);
    setLink(q('.cta-row .btn'), c.button_url, c.button_text);
    setLink(q('.cta-row .link-light'), c.link_url, c.link_text);
    refresh();
  }

  const SOCIAL = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['x', 'X']];
  function renderContact(c, settings) {
    setSeo(c.seo);
    const info = c.info || {}, box = settings.contact || {}, social = settings.social || {};
    const root = q('.contact-info');
    text(q('h2', root), info.title);
    const rows = [
      [info.email_label, box.email, v => 'mailto:' + v],
      [info.phone_label, box.phone || box.whatsapp, v => 'tel:' + v.replace(/[^\d+]/g, '')],
      [info.address_label, box.address, null],
      [info.hours_label, box.hours, null]
    ].filter(r => r[1]);
    const dl = q('dl', root);
    if (dl) { dl.innerHTML = rows.map(([label, value, href]) => `<div><dt>${esc(label)}</dt><dd>${href ? `<a href="${esc(href(value))}">${esc(value)}</a>` : esc(value)}</dd></div>`).join(''); show(dl, rows.length > 0); }
    const follow = q('.follow'), links = SOCIAL.filter(([k]) => social[k]);
    if (follow) {
      follow.innerHTML = esc(info.follow_label) + ' ' + links.map(([k, label]) => `<a href="${esc(social[k])}" target="_blank" rel="noopener">${label}</a>`).join(' · ');
      show(follow, links.length > 0);
    }

    const form = c.form || {};
    text(q('#contactForm button[type=submit]'), form.button);
    const note = q('#contactForm small'); text(note, form.note); show(note, !!form.note);
    const topic = q('#topic');
    if (topic) { const keep = topic.value; topic.innerHTML = (form.topics || []).map(t => `<option>${esc(t.label)}</option>`).join(''); if (keep) topic.value = keep; }

    const faq = c.faq || {}, shown = (faq.items || []).filter(i => i.q && i.a);
    show(q('#faq'), faq.visible !== false && shown.length > 0);
    text(q('#h-faq'), faq.title);
    const list = q('.faq');
    if (list) list.innerHTML = shown.map(i => `<details><summary>${esc(i.q)}</summary><p>${esc(i.a).replace(/\n/g, '<br>')}</p></details>`).join('');
  }

  function apply(data) {
    const sf = data.storefront;
    if (!sf) return;
    window.MaisonStorefront = sf;
    applyGlobal(sf.global, data);
    if (q('#signatureGrid')) renderHome(sf.home || {});
    else if (q('#h-phil')) renderAbout(sf.about || {});
    else if (q('#contactForm')) renderContact(sf.contact || {}, data.settings || {});
    document.dispatchEvent(new CustomEvent('maison:storefront', { detail: sf }));
  }

  /* ------------------------------------------------------------ boot: cached copy first, then the server */
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (err) { cached = null; }
  if (cached && cached.storefront) { try { apply(cached); } catch (err) { console.warn(err); } }

  MaisonApi.getStore().then(res => {
    const s = res.store || {}, st = s.settings || {};
    if (!s.storefront) return;
    const data = { name: s.name, storefront: s.storefront, settings: { contact: st.contact || {}, social: st.social || {} } };
    const same = cached && JSON.stringify(cached) === JSON.stringify(data);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (err) {}
    if (!same) apply(data);
  }).catch(err => console.warn(err.message || err));
})();
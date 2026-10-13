/* MAISON IBRA - shared UI helpers: skeleton loaders, loading buttons, empty/error states.
   Loaded in <head> on every public page BEFORE the other scripts, so everything below must work without the DOM body. */
(function () {
  'use strict';
  if (window.Ui) return;

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
  const line = (w = 'w80') => `<span class="sk sk-line ${w}"></span>`;

  /* First visit (no cached storefront): hide the placeholder copy behind a shimmer until the content arrives. */
  try {
    if (!localStorage.getItem('maison_storefront_v1')) {
      document.documentElement.classList.add('sf-pending');
      setTimeout(() => document.documentElement.classList.remove('sf-pending'), 6000); // never leave a page shimmering
    }
  } catch (e) {}

  /* ---------- Skeleton templates: each mirrors the real component's layout so nothing jumps when content lands ---------- */
  const cols = () => (innerWidth >= 1000 ? 4 : innerWidth >= 700 ? 3 : 2);
  const sk = {
    count: rows => cols() * (rows || 2),
    cards: n => rep(n || cols() * 2, () => `<article class="card sk-card" aria-hidden="true"><div class="media"><span class="sk sk-media"></span></div><div class="card-info">${line('w30')}<span class="sk sk-title"></span>${line('w80')}<span class="sk sk-price"></span></div></article>`),
    pdp: () => `<div class="sk-pdp" aria-hidden="true"><div><span class="sk sk-media"></span><div class="sk-thumbs"><span class="sk"></span><span class="sk"></span><span class="sk"></span></div></div>
      <div>${line('w40')}<span class="sk sk-h1"></span><span class="sk sk-price" style="margin:0 0 24px"></span>${line('w100')}${line('w100')}${line('w60')}<span style="display:block;height:24px"></span><span class="sk sk-btn"></span><span style="display:block;height:32px"></span>${line('w100')}${line('w100')}</div></div>`,
    bagLines: n => `<ul class="bag-lines" aria-hidden="true">${rep(n || 2, () => `<li class="sk-bagline"><span class="sk sk-thumb"></span><div>${line('w80')}${line('w40')}<span class="sk" style="height:36px;width:110px;margin-top:10px"></span></div><span class="sk" style="height:14px;width:60px"></span></li>`)}</ul>`,
    bagFoot: () => `<div aria-hidden="true">${line('w100')}${line('w100')}<span class="sk sk-btn" style="width:100%"></span></div>`,
    banks: n => rep(n || 2, () => `<div class="sk-bank" aria-hidden="true"><span class="sk sk-title" style="width:50%"></span>${line('w60')}${line('w80')}</div>`),
    checkout: () => `<div aria-hidden="true">${line('w30')}${line('w100')}${line('w100')}<span style="display:block;height:18px"></span>${line('w30')}<span class="sk" style="height:46px;display:block"></span><span style="display:block;height:14px"></span><span class="sk" style="height:46px;display:block"></span></div>`,
    orders: n => rep(n || 3, () => `<div class="sk-order" aria-hidden="true"><span class="sk" style="height:16px;width:36%"></span>${line('w20')}</div>`),
    policy: () => `<div class="sk-policy" aria-hidden="true">${line('w100')}${line('w80')}<span class="sk sk-h2"></span>${line('w100')}${line('w100')}${line('w60')}<span class="sk sk-h2"></span>${line('w100')}${line('w80')}</div>`,
    chips: () => `<div class="sk-chips" aria-hidden="true"><span class="sk"></span><span class="sk"></span><span class="sk"></span></div>`,
    lines: (n, w) => rep(n || 3, i => line(i === (n || 3) - 1 ? 'w60' : (w || 'w100')))
  };

  /* Shows `html` (a skeleton) in `host` only if loading takes longer than `delay`, so instant loads never flash it;
     once shown it stays for at least `min` ms so it never flickers. Usage:
        const ld = Ui.loading(grid, Ui.sk.cards()); ...await data...; await ld.end(); grid.innerHTML = real; */
  function loading(host, html, o = {}) {
    const delay = o.delay ?? 150, min = o.min ?? 350;
    let shownAt = 0, ended = false;
    host.setAttribute('aria-busy', 'true');
    if (o.reserve !== false) host.classList.add('sk-grid-host');
    const t = setTimeout(() => {
      if (ended) return;
      host.innerHTML = '<span class="sr" role="status">Loading</span>' + html;
      host.style.opacity = '';
      shownAt = Date.now();
    }, delay);
    return {
      async end() {
        ended = true; clearTimeout(t);
        if (shownAt) { const wait = min - (Date.now() - shownAt); if (wait > 0) await sleep(wait); }
        host.removeAttribute('aria-busy'); host.classList.remove('sk-grid-host');
      }
    };
  }

  /* ---------- Empty / error states ---------- */
  const ICON_ERR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>';
  const ICON_EMPTY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';
  const errorText = err => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'You appear to be offline. Check your connection and try again.';
    if (err && err.status >= 500) return 'The server had a problem. Please try again in a moment.';
    return (err && err.message) || 'Something went wrong. Please try again.';
  };
  const errorBox = (err, o = {}) => `<div class="state-box" role="alert">${ICON_ERR}<h3>${esc(o.title || 'We could not load this')}</h3><p>${esc(typeof err === 'string' ? err : errorText(err))}</p>${o.retry === false ? '' : '<button class="btn btn-dark" type="button" data-ui-retry>Try again</button>'}</div>`;
  const emptyBox = (title, text, o = {}) => `<div class="state-box">${ICON_EMPTY}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${o.href ? `<a class="btn btn-dark" href="${esc(o.href)}">${esc(o.label || 'Continue shopping')}</a>` : ''}</div>`;
  const bound = new WeakMap();
  /* Calls `fn` when a [data-ui-retry] button inside `host` is clicked (the latest fn wins). */
  function onRetry(host, fn) {
    if (!host) return;
    if (!bound.has(host)) host.addEventListener('click', e => { if (e.target.closest('[data-ui-retry]')) { const f = bound.get(host); if (f) f(); } });
    bound.set(host, fn);
  }

  /* ---------- Buttons: disable at once, show a spinner, restore on failure ---------- */
  const btn = {
    start(el, label) {
      if (!el || el.dataset.uiBusy) return false; // a second click while busy is ignored
      el.dataset.uiBusy = '1';
      el._uiHtml = el.innerHTML;
      el.disabled = true; el.setAttribute('aria-busy', 'true'); el.classList.add('is-loading');
      el.innerHTML = `<span class="spin" aria-hidden="true"></span><span>${esc(label || el.textContent.trim())}</span>`;
      return true;
    },
    stop(el) {
      if (!el || !el.dataset.uiBusy) return;
      delete el.dataset.uiBusy;
      if (el._uiHtml != null) el.innerHTML = el._uiHtml;
      el.disabled = false; el.removeAttribute('aria-busy'); el.classList.remove('is-loading');
    }
  };
  /* run(button, 'Sending...', async () => {...}) - busy for the duration, always restored, duplicate clicks ignored. */
  async function run(el, label, fn) {
    if (!btn.start(el, label)) return undefined;
    try { return await fn(); } finally { btn.stop(el); }
  }

  const fmtMoney = (n, cur) => (cur || '₦') + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });

  /* "Delivery costs ₦2,500 and is free on orders of ₦150,000 or more." from the public delivery settings. */
  const deliverySentence = (d, cur) => {
    const fee = Number(d && d.fee) || 0, free = Number(d && d.free_threshold) || 0;
    if (fee <= 0) return 'Delivery is free on all orders.';
    return free > 0 ? `Delivery costs ${fmtMoney(fee, cur)} and is free on orders of ${fmtMoney(free, cur)} or more.` : `Delivery costs ${fmtMoney(fee, cur)}.`;
  };

  window.Ui = { deliverySentence, esc, sleep, sk, loading, errorBox, emptyBox, errorText, onRetry, btn, run, fmtMoney };
})();

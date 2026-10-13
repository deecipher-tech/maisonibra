/* MAISON IBRA - Progressive Web App layer. Load LAST on every public page.

   1. Registers sw.js and keeps the manifest, theme colour and Apple icon in step with Admin > Settings > App (PWA).
   2. Install prompt: shown after the visitor has spent `delay_seconds` (default 60) on the site in total, across pages.
        Android / desktop Chromium -> native prompt;  iOS Safari -> step-by-step instructions;  Safari on Mac -> instructions;
        anything else -> nothing is shown (window.MaisonPwa.install() explains politely if called).
      Never shown when already installed or running as an app; "Later" snoozes for 7, then 30, then 90 days.
   3. Update flow: a new service worker waits (never activated behind the user's back), and a new admin "release" is
      detected by comparing versions. Both end in one "Update available" sheet. Update now -> caches refreshed ->
      a single reload. The bag (localStorage) and the session (cookie) are never touched. */
(function () {
  'use strict';

  const K = { applied: 'maison_pwa_version', time: 'maison_pwa_seconds', dismiss: 'maison_pwa_dismiss', installed: 'maison_pwa_installed' };
  const S = { shown: 'maison_pwa_shown', snooze: 'maison_pwa_update_snooze', reloadAt: 'maison_pwa_reload_at' };
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const Ui = window.Ui || { btn: { start: () => true, stop() {} }, run: async (b, l, f) => f() };

  /* ---------- environment ---------- */
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo/.test(ua);
  const isMacSafari = !isIOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua);
  const standalone = () => ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(m => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true;
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  let cfg = null;            // public/pwa payload
  let deferred = null;       // the browser's install prompt, once it offers one
  let reg = null;            // service worker registration
  let pending = null;        // { worker, version } waiting to be applied
  let userAskedUpdate = false;
  const defaults = { name: document.title.split('|')[0].trim() || 'App', short_name: 'App', theme_color: '#070605', icons: { 192: 'assets/icons/icon-192.png', 512: 'assets/icons/icon-512.png' }, install: { enabled: true, delay_seconds: 60, title: '', text: '' } };
  const conf = () => cfg || defaults;

  /* ---------- dismissal memory ---------- */
  const dismissal = () => { try { return JSON.parse(ls.get(K.dismiss)) || { count: 0, until: 0 }; } catch (e) { return { count: 0, until: 0 }; } };
  function snoozeInstall() {
    const d = dismissal(), count = d.count + 1, days = count === 1 ? 7 : count === 2 ? 30 : 90;
    ls.set(K.dismiss, JSON.stringify({ count, until: Date.now() + days * 864e5 }));
  }
  const installed = () => standalone() || ls.get(K.installed) === '1';

  function mode() {
    if (installed()) return 'installed';
    if (deferred) return 'native';
    if (isIOSSafari) return 'ios';
    if (isIOS) return 'ios-other';
    if (isMacSafari) return 'mac';
    return 'unsupported';
  }

  /* ---------- sheet (dialog) ---------- */
  let layer = null, lastFocus = null;
  function closeSheet() {
    if (!layer) return;
    layer.remove(); layer = null;
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (!layer) return;
    if (e.key === 'Escape') { e.preventDefault(); const l = $('[data-secondary]', layer); if (l && !l.disabled) l.click(); return; }
    if (e.key !== 'Tab') return;
    const f = [...layer.querySelectorAll('button:not([disabled]), a[href]')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], sheet = $('.pwa-sheet', layer);
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function openSheet(o) {
    closeSheet();
    lastFocus = document.activeElement;
    const id = 'pwaT' + Date.now();
    layer = document.createElement('div');
    layer.className = 'pwa-layer' + (o.instructions ? ' is-instructions' : '');
    layer.innerHTML = `<div class="pwa-scrim" data-secondary-click></div>
      <div class="pwa-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1">
        <div class="pwa-head"><span class="pwa-icon" style="background-image:url('${esc(o.icon)}')" aria-hidden="true"></span><div><h2 id="${id}">${esc(o.title)}</h2>${o.sub || ''}</div></div>
        ${o.body || ''}
        <p class="pwa-err" role="alert"></p>
        <div class="pwa-actions"><button class="btn" type="button" data-primary>${esc(o.primary)}</button><button class="pwa-later" type="button" data-secondary>${esc(o.secondary)}</button></div>
      </div>`;
    document.body.append(layer);
    const primary = $('[data-primary]', layer), secondary = $('[data-secondary]', layer);
    const api = { el: layer, primary, secondary, error: m => { $('.pwa-err', layer).textContent = m || ''; } };
    primary.addEventListener('click', () => { api.error(''); o.onPrimary && o.onPrimary(api); });
    secondary.addEventListener('click', () => { if (secondary.disabled) return; o.onSecondary && o.onSecondary(api); });
    $('[data-secondary-click]', layer).addEventListener('click', () => secondary.click());
    document.addEventListener('keydown', onKey, true);
    $('.pwa-sheet', layer).focus();
    return api;
  }

  /* ---------- install ---------- */
  const SHARE = '<svg class="sharebtn" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const STEPS = {
    ios: [`Tap the Share button ${SHARE} in Safari.`, 'Scroll down and tap <strong>Add to Home Screen</strong>.', 'Confirm the app name and tap <strong>Add</strong>.', 'Return to your Home Screen to find the installed app.'],
    'ios-other': ['Open this page in <strong>Safari</strong>. Adding to the Home Screen is only available there.', `Tap the Share button ${SHARE} in Safari.`, 'Scroll down and tap <strong>Add to Home Screen</strong>.', 'Confirm the app name and tap <strong>Add</strong>.'],
    mac: ['In the Safari menu bar, choose <strong>File</strong>.', 'Choose <strong>Add to Dock</strong>.', 'Confirm the app name and click <strong>Add</strong>.', 'Open the installed app from your Dock.']
  };

  function showInstructions(m) {
    const c = conf();
    openSheet({
      instructions: true, icon: c.icons[192], title: m === 'mac' ? 'Add to Dock (Safari)' : 'Add to Home Screen (Safari)', sub: `<p>${esc(c.name)}</p>`,
      body: `<ol class="pwa-steps">${STEPS[m].map(s => `<li><span>${s}</span></li>`).join('')}</ol>`,
      primary: 'Got it', secondary: 'Close',
      onPrimary: () => { snoozeInstall(); closeSheet(); },
      onSecondary: () => { snoozeInstall(); closeSheet(); }
    });
  }

  async function nativePrompt(sheet) {
    if (!deferred) { sheet && sheet.error('Your browser did not offer to install the app. Use its menu and choose Install app.'); return; }
    const ev = deferred; deferred = null;
    ev.prompt();
    const choice = await ev.userChoice;
    if (choice && choice.outcome === 'accepted') { ls.set(K.installed, '1'); closeSheet(); }
    else { snoozeInstall(); closeSheet(); }
  }

  /* Install button of the popup. */
  function onInstallClick(sheet) {
    const m = mode();
    if (m === 'native') {
      sheet.secondary.disabled = true;
      Ui.run(sheet.primary, 'Installing...', () => nativePrompt(sheet)).catch(() => sheet.error('Installation did not start. Please try again.')).finally(() => { if (layer) sheet.secondary.disabled = false; });
    } else if (STEPS[m]) { closeSheet(); showInstructions(m); }
    else { sheet.error('Installing is not supported in this browser. Try Chrome, Edge or Safari.'); }
  }

  function showInstallPrompt() {
    const c = conf(), m = mode();
    if (!['native', 'ios', 'ios-other', 'mac'].includes(m) || layer) return false;
    ss.set(S.shown, '1');
    openSheet({
      icon: c.icons[192], title: c.install.title || `Install ${c.name}`, sub: `<p>${esc(c.name)}</p>`,
      body: `<p>${esc(c.install.text || `Add ${c.name} to your home screen for faster shopping.`)}</p>
        <ul class="pwa-perks"><li>${TICK}Opens in one tap, full screen</li><li>${TICK}Browse recent pages offline</li><li>${TICK}Your bag stays saved</li></ul>`,
      primary: 'Install', secondary: 'Later',
      onPrimary: onInstallClick,
      onSecondary: () => { snoozeInstall(); closeSheet(); }
    });
    return true;
  }

  /* One minute on the site, counted only while the tab is visible and across page loads. */
  function startTimer() {
    let seconds = parseInt(ls.get(K.time), 10) || 0, tick = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      seconds++; tick++;
      if (tick % 5 === 0) ls.set(K.time, String(seconds));
      if (seconds >= (conf().install.delay_seconds || 60)) maybeShow(timer, seconds);
    }, 1000);
    addEventListener('pagehide', () => ls.set(K.time, String(seconds)));
  }
  const busyElsewhere = () => (typeof Bag !== 'undefined' && Bag.open) || !!layer || !!document.querySelector('dialog[open]');
  function maybeShow(timer) {
    if (ss.get(S.shown) || installed() || !conf().install.enabled) { if (installed()) clearInterval(timer); return; }
    if (dismissal().until > Date.now() || busyElsewhere()) return;
    if (showInstallPrompt()) clearInterval(timer);
  }

  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  addEventListener('appinstalled', () => { ls.set(K.installed, '1'); deferred = null; if (layer && !$('.pwa-steps', layer)) closeSheet(); });

  /* ---------- update ---------- */
  const reloadedRecently = () => Date.now() - (parseInt(ss.get(S.reloadAt), 10) || 0) < 15000;
  function reloadOnce() {
    if (reloadedRecently()) return; // never a reload loop
    ss.set(S.reloadAt, String(Date.now()));
    location.reload();
  }
  const canInterrupt = () => !(typeof Bag !== 'undefined' && Bag.open && (Bag.view === 'checkout' || Bag.busy));
  const askWorker = (worker, message, ms = 8000) => new Promise((resolve, reject) => {
    const ch = new MessageChannel(), t = setTimeout(() => reject(new Error('timeout')), ms);
    ch.port1.onmessage = e => { clearTimeout(t); resolve(e.data); };
    worker.postMessage(message, [ch.port2]);
  });

  async function applyUpdate() {
    while (!canInterrupt()) await new Promise(r => setTimeout(r, 1500)); // never reload mid-order
    const version = (pending && pending.version) || (cfg && cfg.version) || '';
    if (reg) { try { await reg.update(); } catch (e) {} }
    const waiting = (reg && reg.waiting) || (pending && pending.worker && pending.worker.state === 'installed' ? pending.worker : null);
    const active = reg && reg.active;
    if (version && active) { // content release: refresh this device's caches
      const res = await askWorker(active, { type: 'APPLY_RELEASE', version });
      if (!res || res.ok === false) throw new Error('The update could not be prepared.');
    }
    if (version) ls.set(K.applied, version);
    if (waiting) { userAskedUpdate = true; waiting.postMessage({ type: 'SKIP_WAITING' }); setTimeout(reloadOnce, 4000); return; } // controllerchange reloads sooner
    reloadOnce();
  }

  let updateShown = false;
  function offerUpdate(info) {
    pending = Object.assign(pending || {}, info);
    if (updateShown || ss.get(S.snooze)) return;
    if (!canInterrupt() || layer) { setTimeout(() => offerUpdate({}), 5000); return; }
    updateShown = true;
    const c = conf(), v = (pending.version || (cfg && cfg.version)) ? `<span class="pwa-update-chip">Version ${esc(pending.version || cfg.version)}</span>` : '';
    openSheet({
      icon: c.icons[192], title: 'Update available', sub: `<p>${esc(c.name)}</p>${v}`,
      body: `<p>A new version of ${esc(c.name)} is ready. Update now to get the latest products, prices and features. Your bag and sign-in are kept.</p>`,
      primary: 'Update now', secondary: 'Later',
      onPrimary: sheet => {
        sheet.secondary.disabled = true;
        Ui.run(sheet.primary, 'Updating...', applyUpdate).catch(err => sheet.error((err && err.message === 'timeout') ? 'The update is taking too long. Check your connection and try again.' : 'We could not update just now. Please try again.')).finally(() => { if (layer) sheet.secondary.disabled = false; });
      },
      onSecondary: () => { ss.set(S.snooze, '1'); updateShown = false; closeSheet(); } // asked again the next time the app is opened
    });
  }

  /* ---------- config, manifest, theme ---------- */
  async function loadConfig() {
    if (!window.MaisonApi || !MaisonApi.getPwa) return null;
    try { cfg = (await MaisonApi.getPwa()).pwa || null; } catch (e) { /* offline: keep the last known values */ }
    return cfg;
  }
  function meta(name, content) {
    let m = $(`meta[name="${name}"]`);
    if (!m) { m = document.createElement('meta'); m.name = name; document.head.append(m); }
    m.content = content;
  }
  function applyBranding() {
    if (!cfg) return;
    if (cfg.theme_color) meta('theme-color', cfg.theme_color);
    meta('apple-mobile-web-app-capable', 'yes');
    meta('mobile-web-app-capable', 'yes');
    meta('apple-mobile-web-app-title', cfg.short_name || cfg.name);
    meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    let icon = $('link[rel="apple-touch-icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'apple-touch-icon'; document.head.append(icon); }
    if (cfg.icons && cfg.icons[512]) icon.href = cfg.icons[512];
  }
  /* If manifest.json is not wired to the API on this host (no rewrite), build an equivalent one in the browser. */
  async function ensureManifest() {
    let link = $('link[rel="manifest"]');
    if (!link) { link = document.createElement('link'); link.rel = 'manifest'; link.href = 'manifest.json'; document.head.append(link); }
    try {
      const r = await fetch(link.href, { cache: 'no-store' });
      if (r.ok && /json/i.test(r.headers.get('content-type') || '')) return;
    } catch (e) { return; } // offline: the service worker / browser keeps the last manifest
    if (!cfg) return;
    const abs = u => new URL(u, document.baseURI).href, dir = new URL('./', document.baseURI).href;
    const manifest = {
      id: dir, name: cfg.name, short_name: cfg.short_name, description: cfg.description, start_url: abs('index.html?source=pwa'), scope: dir,
      display: cfg.display || 'standalone', theme_color: cfg.theme_color, background_color: cfg.background_color,
      icons: [{ src: abs(cfg.icons[192]), sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: abs(cfg.icons[512]), sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: abs(cfg.icons.maskable || cfg.icons[512]), sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
    };
    link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  }

  /* ---------- version checks ---------- */
  let lastCheck = 0;
  async function checkForUpdate(force) {
    if (!force && Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    if (reg) { try { await reg.update(); } catch (e) {} }
    await loadConfig();
    applyBranding();
    if (!cfg || !cfg.version) return;
    const applied = ls.get(K.applied);
    if (!applied) { ls.set(K.applied, cfg.version); return; } // first visit on this device: already current
    if (applied !== cfg.version) offerUpdate({ version: cfg.version });
  }

  async function registerWorker() {
    if (!('serviceWorker' in navigator) || !secure) return;
    try {
      reg = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: new URL('./', document.baseURI).pathname, updateViaCache: 'none' });
    } catch (e) { console.warn('Service worker registration failed:', e); return; }
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate({ worker: reg.waiting });
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate({ worker: w }); });
    });
    // controllerchange also fires on the very first install (clients.claim); only reload when the user asked for an update.
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (userAskedUpdate) reloadOnce(); });
  }

  /* ---------- public API ---------- */
  window.MaisonPwa = {
    mode,
    canInstall: () => ['native', 'ios', 'ios-other', 'mac'].includes(mode()),
    install() { if (!showInstallPrompt() && !installed()) alert('Installing is not available in this browser. Try Chrome, Edge or Safari.'); },
    checkForUpdate: () => checkForUpdate(true)
  };

  /* ---------- boot ---------- */
  (async function boot() {
    await loadConfig();
    applyBranding();
    ensureManifest();
    if (secure) { addEventListener('load', () => registerWorker().then(() => checkForUpdate(true))); }
    else checkForUpdate(true);
    if (!installed()) startTimer();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
    addEventListener('online', () => checkForUpdate(true));
    setInterval(() => checkForUpdate(), 20 * 60 * 1000);
  })();
})();

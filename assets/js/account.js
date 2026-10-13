/* Customer account: profile and order history (GET account/orders). Guests are sent to the sign-in page. */
(function () {
  const root = $('#acctRoot');
  if (!root) return;
  const esc = Ui.esc, money = (n, c) => Ui.fmtMoney(n, c);
  const date = s => { const d = new Date(String(s || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s || '') ? '' : 'Z')); return isNaN(d) ? String(s || '').slice(0, 10) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

  function status(o) {
    if (o.fulfillment_status === 'cancelled') return ['Cancelled', 'cancelled'];
    if (o.payment_status === 'failed') return ['Payment rejected', 'failed'];
    if (o.payment_status === 'refunded') return ['Refunded', 'refunded'];
    if (o.payment_status === 'pending') return ['Awaiting payment verification', 'pending'];
    return o.fulfillment_status === 'new' ? ['Payment confirmed', 'paid'] : [o.fulfillment_status[0].toUpperCase() + o.fulfillment_status.slice(1), o.fulfillment_status];
  }

  function orderHTML(o) {
    const [label, cls] = status(o);
    return `<details class="order"><summary><span><span class="order-no">${esc(o.order_number)}</span><br><span class="order-date">${esc(date(o.created_at))}</span></span><span class="order-total">${money(o.total, o.currency)}</span><span class="order-date">${o.items.length} item${o.items.length === 1 ? '' : 's'}</span><span class="order-status is-${esc(cls)}">${esc(label)}</span></summary>
      <div class="order-detail"><ul>${o.items.map(i => `<li><span>${i.quantity} &times; ${esc(i.name)}</span><span>${money(i.line_total, o.currency)}</span></li>`).join('')}</ul>
      <div class="order-sum"><div><span>Subtotal</span><span>${money(o.subtotal, o.currency)}</span></div>${o.delivery_fee > 0 ? `<div><span>Delivery</span><span>${money(o.delivery_fee, o.currency)}</span></div>` : ''}<div class="is-total"><span>Total</span><span>${money(o.total, o.currency)}</span></div></div></div></details>`;
  }

  function render(c, orders) {
    root.innerHTML = `<div class="acct-top"><h1>Hello, ${esc(String(c.name || '').split(' ')[0] || 'there')}</h1><button class="btn btn-dark" type="button" id="signOut">Sign out</button></div>
      <dl class="acct-facts"><div><dt>Name</dt><dd>${esc(c.name)}</dd></div><div><dt>Email</dt><dd>${esc(c.email)}</dd></div><div><dt>Phone</dt><dd>${esc(c.phone || 'Not added')}</dd></div></dl>
      <section class="acct-orders" aria-labelledby="ordersTitle"><h2 id="ordersTitle">Your orders</h2>${orders.length ? orders.map(orderHTML).join('') : Ui.emptyBox('No orders yet', 'When you place an order it will appear here with its status.', { href: 'shop.html', label: 'Start shopping' })}</section>`;
    $('#signOut').addEventListener('click', e => Ui.run(e.currentTarget, 'Signing out...', async () => {
      try { await MaisonApi.logout(); } catch (err) { Ui.errorText(err); }
      try { sessionStorage.removeItem('maison_customer'); } catch (err) {}
      location.replace('./index.html');
    }));
  }

  const skeleton = () => `<span class="sr" role="status">Loading your account</span><div class="acct-top"><span class="sk sk-h1" style="width:min(420px,70%)"></span></div><div class="sk" style="height:76px;margin-bottom:40px"></div>${Ui.sk.orders(3)}`;
  const toLogin = () => { try { sessionStorage.setItem('maison_after_login', 'account.html'); } catch (e) {} location.replace('./login.html'); };

  async function load() {
    const ld = Ui.loading(root, skeleton(), { reserve: false, delay: 100 });
    try {
      const me = await MaisonApi.me();
      const acc = me.account;
      if (acc && acc.type === 'admin') { location.replace('./admin/index.html'); return; }
      if (!acc || acc.type !== 'customer') { toLogin(); return; }
      const data = await MaisonApi.accountOrders();
      await ld.end();
      render(acc.customer, data.orders || []);
    } catch (error) {
      await ld.end();
      if (error.status === 401) return toLogin();
      root.innerHTML = Ui.errorBox(error, { title: 'We could not load your account' });
    } finally { root.removeAttribute('aria-busy'); }
  }
  Ui.onRetry(root, load);
  load();
})();

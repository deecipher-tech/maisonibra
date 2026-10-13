/* Contact form: validated in the browser, then saved by the API (table `messages`; the server validates again). */
(function () {
  const form = document.querySelector('#contactForm');
  if (!form) return;

  const field = id => document.querySelector(id);
  const status = field('#contactStatus');
  const setError = (input, message) => {
    const err = field(`#${input.id}-err`);
    if (err) err.textContent = message;
    input.toggleAttribute('aria-invalid', Boolean(message));
  };
  const say = (text, kind) => { status.textContent = text; status.className = 'status' + (kind ? ' is-' + kind : ''); };
  const inputs = { name: field('#name'), email: field('#cemail'), message: field('#message'), phone: field('#phone'), topic: field('#topic') };
  const errorKey = { name: 'name', email: 'email', message: 'message' };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const { name, email, message, phone, topic } = inputs;
    let valid = true;
    Object.values(errorKey).forEach(k => setError(inputs[k], ''));
    say('');

    if (!name.value.trim()) { setError(name, 'Enter your name.'); valid = false; }
    if (!email.checkValidity() || !email.value.trim()) { setError(email, 'Enter a valid email address.'); valid = false; }
    if (message.value.trim().length < 10) { setError(message, 'Write a message of at least 10 characters.'); valid = false; }
    if (!valid) { const first = form.querySelector('[aria-invalid]'); if (first) first.focus(); return; }

    await Ui.run(form.querySelector('button[type=submit]'), 'Sending...', async () => {
      try {
        const res = await MaisonApi.submitContact({
          name: name.value.trim(), email: email.value.trim(), phone: phone.value.trim(), topic: topic.value,
          message: message.value.trim(), website: form.elements.website ? form.elements.website.value : ''
        });
        say(res.message || 'Thank you. Your message has been sent.', 'ok');
        form.reset();
      } catch (error) {
        const d = error.details || {};
        Object.keys(errorKey).forEach(k => { if (d[k]) setError(inputs[k], d[k]); });
        if (d.phone) { phone.setAttribute('aria-invalid', 'true'); }
        say(Object.keys(d).length ? 'Please check the highlighted fields.' : Ui.errorText(error), 'error'); // the form keeps what was typed
        const first = form.querySelector('[aria-invalid]'); if (first) first.focus();
      }
    });
  });
})();

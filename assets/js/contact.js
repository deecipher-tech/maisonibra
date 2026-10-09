/* Contact form validation. API delivery endpoint will be wired with the orders/customer module. */
(function () {
  const form = document.querySelector('#contactForm');
  if (!form) return;

  const field = id => document.querySelector(id);
  const setError = (input, message) => {
    const err = field(`#${input.id}-err`);
    if (err) err.textContent = message;
    input.toggleAttribute('aria-invalid', Boolean(message));
  };

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = field('#name');
    const email = field('#cemail');
    const message = field('#message');
    const status = field('#contactStatus');
    let valid = true;

    setError(name, '');
    setError(email, '');
    setError(message, '');

    if (!name.value.trim()) {
      setError(name, 'Enter your name.');
      valid = false;
    }
    if (!email.checkValidity()) {
      setError(email, 'Enter a valid email address.');
      valid = false;
    }
    if (!message.value.trim()) {
      setError(message, 'Enter your message.');
      valid = false;
    }

    if (!valid) return;
    if (form.elements.website.value) return;

    status.textContent = 'Thank you. Your message is ready for the support inbox integration.';
    form.reset();
  });
})();

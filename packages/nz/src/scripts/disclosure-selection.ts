for (const summary of document.querySelectorAll<HTMLElement>(
  '.plan-disclosure > .plan-summary, .booking-notes > summary',
)) {
  summary.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.detail < 2) return;

    if (
      event.target instanceof Element &&
      event.target.closest(
        'a, button, input, textarea, select, [contenteditable]',
      )
    ) {
      return;
    }

    // Stop repeated clicks selecting text; keep the click's native toggle.
    // The first press still allows deliberate drag selection.
    event.preventDefault();
  });
}

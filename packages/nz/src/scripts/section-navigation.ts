import * as Effect from 'effect/Effect';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Keep ordinary anchor navigation when native, typed view transitions are unavailable.
if (
  document.startViewTransition &&
  CSS.supports('selector(:active-view-transition-type(nz-section-navigation))')
) {
  document.querySelector('.jump-nav')?.addEventListener('click', (event) => {
    if (
      !(event instanceof MouseEvent) ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      reducedMotion.matches ||
      !(event.target instanceof Element)
    ) {
      return;
    }

    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (
      !link ||
      link.hasAttribute('download') ||
      (link.target && link.target !== '_self') ||
      !link.hash ||
      link.hash === window.location.hash ||
      !document.getElementById(decodeURIComponent(link.hash.slice(1)))
    ) {
      return;
    }

    event.preventDefault();
    const transition = document.startViewTransition({
      types: ['nz-section-navigation'],
      // Let the browser handle fragment scrolling, history, and the focus target.
      update: () => window.location.assign(link.href),
    });

    Effect.tryPromise(() => transition.ready).pipe(
      // A skipped or interrupted visual transition must not block navigation.
      Effect.catchTag('UnknownError', () => Effect.void),
      Effect.runFork,
    );
  });
}

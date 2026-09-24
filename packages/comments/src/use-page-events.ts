import { useAtomMount } from '@effect/atom-react';
import * as BrowserStream from '@effect/platform-browser/BrowserStream';
import * as Effect from 'effect/Effect';
import * as Stream from 'effect/Stream';
import { Atom } from 'effect/unstable/reactivity';
import { useLayoutEffect, useMemo, useRef } from 'react';

interface Events {
  rootSelector: string;
  active: boolean;
  picking: boolean;
  pointerActive: boolean;
  root: (element: HTMLElement | null) => void;
  layout: () => void;
  pointer: (event: PointerEvent) => void;
  leave: () => void;
  click: (event: MouseEvent) => void;
  key: (event: KeyboardEvent) => void;
}

export function usePageEvents(events: Events) {
  const current = useRef(events);
  current.current = events;

  const source = useMemo(
    () =>
      Atom.make(
        Effect.gen(function* () {
          const root = document.querySelector<HTMLElement>(events.rootSelector);
          current.current.root(root);

          let frame = 0;

          const updateLayout = () => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
              frame = 0;
              current.current.layout();
            });
          };

          yield* Effect.addFinalizer(() =>
            Effect.sync(() => cancelAnimationFrame(frame)),
          );

          const observer = yield* Effect.acquireRelease(
            Effect.sync(() => new ResizeObserver(updateLayout)),
            (observer) => Effect.sync(() => observer.disconnect()),
          );

          if (root) observer.observe(root);

          const layout = Stream.mergeAll(
            [
              BrowserStream.fromEventListenerWindow('resize'),
              BrowserStream.fromEventListenerDocument('scroll', {
                capture: true,
                passive: true,
              }),
              BrowserStream.fromEventListenerDocument('toggle', {
                capture: true,
              }),
              BrowserStream.fromEventListenerDocument('load', {
                capture: true,
              }),
              Stream.fromEventListener(document.fonts, 'loadingdone'),
              ...(window.visualViewport
                ? [
                    Stream.fromEventListener(window.visualViewport, 'resize'),
                    Stream.fromEventListener(window.visualViewport, 'scroll'),
                  ]
                : []),
            ],
            { concurrency: 'unbounded' },
          );

          yield* layout.pipe(
            Stream.runForEach(() => Effect.sync(updateLayout)),
            Effect.forkScoped,
          );

          // Capture must cancel page navigation synchronously, before event dispatch ends.
          const click = (event: MouseEvent) => {
            if (current.current.picking) current.current.click(event);
          };

          const key = (event: KeyboardEvent) => {
            if (current.current.active) current.current.key(event);
          };

          yield* Effect.acquireRelease(
            Effect.sync(() => {
              document.addEventListener('click', click, true);
              window.addEventListener('keydown', key);
            }),
            () =>
              Effect.sync(() => {
                document.removeEventListener('click', click, true);
                window.removeEventListener('keydown', key);
              }),
          );

          return yield* Effect.never;
        }),
      ),
    [events.rootSelector],
  );

  const pointers = useMemo(
    () =>
      Atom.make(
        Effect.gen(function* () {
          yield* Stream.fromEventListener<PointerEvent>(
            document.documentElement,
            'pointerleave',
          ).pipe(
            Stream.runForEach(() => Effect.sync(() => current.current.leave())),
            Effect.forkScoped,
          );

          return yield* BrowserStream.fromEventListenerDocument(
            'pointermove',
          ).pipe(
            Stream.throttle({
              cost: () => 1,
              units: 1,
              duration: '80 millis',
              strategy: 'enforce',
            }),
            Stream.runForEach((event) =>
              Effect.sync(() => current.current.pointer(event)),
            ),
          );
        }),
      ),
    [],
  );

  const idle = useMemo(() => Atom.make(null), []);
  useAtomMount(source);
  useAtomMount(events.pointerActive ? pointers : idle);
  // This DOM attribute must change before paint, without an atom idle lease.
  useLayoutEffect(() => {
    const root = document.querySelector(events.rootSelector);
    root?.toggleAttribute('data-comments-picking', events.picking);

    return () => {
      root?.removeAttribute('data-comments-picking');
    };
  }, [events.picking, events.rootSelector]);
}

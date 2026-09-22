import type { Cursor, Target } from './protocol';

const ELEMENTS = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,figcaption,img,a,button,summary';
export const UI_SELECTOR =
  '[data-comments-ui],[data-feedback-ui],[data-agentation-root],astro-dev-toolbar';
export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function findElement(
  selector: string,
  root: Element | null,
): HTMLElement | null {
  if (!selector || !root) return null;
  try {
    const element = document.querySelector<HTMLElement>(selector);
    return element && root.contains(element) && !element.closest(UI_SELECTOR)
      ? element
      : null;
  } catch {
    return null;
  }
}

export function targetElement(
  element: Element,
  root: Element,
): HTMLElement | null {
  if (!root.contains(element) || element.closest(UI_SELECTOR)) return null;
  const target = element.closest<HTMLElement>(ELEMENTS);
  return target && root.contains(target) ? target : null;
}

function selectorFor(element: Element, root: Element): string {
  const parts: string[] = [];
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const key = current.getAttribute('data-comment-anchor');
    if (key) {
      parts.unshift(`[data-comment-anchor="${CSS.escape(key)}"]`);
      break;
    }
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter(
          (child) => child.tagName === current.tagName,
        )
      : [];
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
    if (current === root && current === document.body) break;
  }
  return parts.join(' > ');
}

export function targetFor(
  element: HTMLElement,
  root: Element,
  point?: { x: number; y: number },
): Target {
  const rect = element.getBoundingClientRect();
  const text =
    (element instanceof HTMLImageElement ? element.alt : element.textContent) ??
    element.tagName;
  return {
    selector: selectorFor(element, root),
    quote:
      text.replace(/\s+/g, ' ').trim().slice(0, 180) ||
      element.tagName.toLowerCase(),
    x: point ? clamp((point.x - rect.left) / rect.width, 0, 1) : 0.5,
    y: point ? clamp((point.y - rect.top) / rect.height, 0, 1) : 0.5,
  };
}

export function pointFor(cursor: Cursor, root: Element | null) {
  const element = findElement(cursor.selector, root);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: rect.left + rect.width * cursor.x,
    y: rect.top + rect.height * cursor.y,
    rect,
  };
}

export function reveal(target: Target, root: Element | null) {
  const element = findElement(target.selector, root);
  if (!element) return;
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  element.scrollIntoView({
    block: 'center',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
  });
}

export function pageTargets(root: Element): Target[] {
  return Array.from(root.querySelectorAll<HTMLElement>(ELEMENTS))
    .filter(
      (element) =>
        !element.closest(UI_SELECTOR) &&
        (element.textContent?.trim() || element instanceof HTMLImageElement),
    )
    .map((element) => targetFor(element, root));
}

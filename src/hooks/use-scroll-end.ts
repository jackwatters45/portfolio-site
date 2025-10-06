// biome-ignore-all lint/correctness/useExhaustiveDependencies: <not my component - trusted source (https://devouringdetails.com/)>
// biome-ignore-all lint/suspicious/noExplicitAny: <not my component - trusted source (https://devouringdetails.com/)>

import { type RefObject, useEffect } from 'react';

export function useScrollEnd(
  callback: () => void,
  target: RefObject<HTMLDivElement | null>,
  deps: any[] = [],
) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    el.addEventListener('scrollend', callback);
    return () => {
      el.removeEventListener('scrollend', callback);
    };
  }, deps);
}

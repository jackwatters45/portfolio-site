/* oxlint-disable react-hooks/exhaustive-deps, typescript/no-explicit-any -- Trusted source: https://devouringdetails.com/ */

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

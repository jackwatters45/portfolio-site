// biome-ignore-all lint/correctness/useExhaustiveDependencies: <not my component - trusted source (https://devouringdetails.com/)>
//
import { useEffect, useState } from 'react';
import useSound_ from 'use-sound';

export function useSound(
  path: string,
  options?: Parameters<typeof useSound_>[1],
) {
  const isTouchDevice = useMediaQuery('(hover: none)');
  const isTinyDevice = useMediaQuery('(max-width: 480px)');
  const isMobile = isTouchDevice || isTinyDevice;

  const [play] = useSound_(path, {
    soundEnabled: !isMobile,
    ...options,
  });

  return play;
}

function useMediaQuery(query: string): boolean {
  const getMatches = (query: string): boolean => {
    // Prevents SSR issues
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  };

  const [matches, setMatches] = useState<boolean>(getMatches(query));

  function handleChange() {
    setMatches(getMatches(query));
  }

  useEffect(() => {
    const matchMedia = window.matchMedia(query);

    // Triggered at the first client-side load and if query changes
    handleChange();

    // Listen matchMedia
    matchMedia.addEventListener('change', handleChange);

    return () => {
      matchMedia.removeEventListener('change', handleChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return matches;
}

import { useEffect, useState } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

    handleChange();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    mediaQuery.addListener(handleChange);
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return prefersReducedMotion;
}

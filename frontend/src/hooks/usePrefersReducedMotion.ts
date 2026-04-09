import { useEffect, useState, useSyncExternalStore } from 'react';
import { getReduceMotionPref, subscribeReduceMotionPref } from '@/lib/generalPrefs';

export function usePrefersReducedMotion(): boolean {
  const appPref = useSyncExternalStore(subscribeReduceMotionPref, getReduceMotionPref);
  const [osPref, setOsPref] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setOsPref(mediaQuery.matches);

    handleChange();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return appPref || osPref;
}

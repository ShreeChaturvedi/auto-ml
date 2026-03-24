import { useEffect, useRef, useState } from 'react';

/**
 * Animates a numeric value from its previous value to the target
 * over `durationMs` using requestAnimationFrame with ease-out.
 *
 * Returns the current interpolated value. Uses `tabular-nums`-safe
 * rounding (same decimal precision as the target).
 */
export function useAnimatedValue(
  target: number,
  durationMs = 500,
  decimals = 4,
): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    prevRef.current = to;

    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic
      const eased = 1 - (1 - progress) ** 3;
      const current = from + (to - from) * eased;
      const factor = 10 ** decimals;
      setDisplay(Math.round(current * factor) / factor);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, decimals]);

  return display;
}

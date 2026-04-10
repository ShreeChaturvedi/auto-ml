import { useEffect, useRef } from 'react';

interface UseCursorOutlineOptions {
  /** Distance in pixels from the element's edge at which the glow activates. */
  proximityThreshold?: number;
}

/**
 * Tracks the cursor's position relative to the ref'd element and exposes it
 * via CSS custom properties (`--outline-x`, `--outline-y`, `--outline-opacity`)
 * so a radial gradient border / mask can light up when the cursor is nearby.
 *
 * Respects `prefers-reduced-motion`: when reduced, no listeners are attached
 * and the element's opacity stays at 0.
 */
export function useCursorOutline({
  proximityThreshold = 220,
}: UseCursorOutlineOptions = {}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Seed initial values if the element is already mounted.
    const initial = ref.current;
    if (initial) {
      initial.style.setProperty('--outline-x', '0px');
      initial.style.setProperty('--outline-y', '0px');
      initial.style.setProperty('--outline-opacity', '0');
    }

    if (reducedMotion) return;

    const handleMouseMove = (event: MouseEvent) => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Shortest distance from cursor to element's rectangle.
      const clampedX = Math.max(0, Math.min(x, rect.width));
      const clampedY = Math.max(0, Math.min(y, rect.height));
      const isInside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      const distance = isInside
        ? 0
        : Math.sqrt((x - clampedX) ** 2 + (y - clampedY) ** 2);

      node.style.setProperty('--outline-x', `${x}px`);
      node.style.setProperty('--outline-y', `${y}px`);
      node.style.setProperty(
        '--outline-opacity',
        distance < proximityThreshold
          ? String(1 - distance / proximityThreshold)
          : '0',
      );
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [proximityThreshold]);

  return { ref };
}

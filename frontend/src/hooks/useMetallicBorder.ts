import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';

import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface UseMetallicBorderOptions {
  /** How close (px) the cursor must be before the shine activates. */
  proximityThreshold?: number;
}

/**
 * Tracks cursor proximity to an element and exposes CSS custom-properties
 * (`--shine-x`, `--shine-y`, `--shine-opacity`) for a metallic-shine border
 * effect.  Also tracks focus-within state for a full-border focus indicator.
 *
 * Attach `wrapperRef` to a container div that has the `.metallic-border` CSS
 * class.  The hook sets custom properties directly on the DOM node to avoid
 * React re-renders on every mousemove.
 */
export function useMetallicBorder({
  proximityThreshold = 80,
}: UseMetallicBorderOptions = {}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  /* ── Mouse proximity tracking via CSS custom properties ─────────── */
  useEffect(() => {
    if (reducedMotion) return;

    const el = wrapperRef.current;
    if (!el) return;

    // Initialise custom properties so the CSS gradient has valid values.
    el.style.setProperty('--shine-x', '0px');
    el.style.setProperty('--shine-y', '0px');
    el.style.setProperty('--shine-opacity', '0');

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Shortest distance from cursor to the element's bounding rectangle.
      const clampedX = Math.max(0, Math.min(x, rect.width));
      const clampedY = Math.max(0, Math.min(y, rect.height));
      const isInside =
        x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      const distance = isInside
        ? 0
        : Math.sqrt((x - clampedX) ** 2 + (y - clampedY) ** 2);

      el.style.setProperty('--shine-x', `${x}px`);
      el.style.setProperty('--shine-y', `${y}px`);
      el.style.setProperty(
        '--shine-opacity',
        distance < proximityThreshold
          ? String(1 - distance / proximityThreshold)
          : '0',
      );
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [proximityThreshold, reducedMotion]);

  /* ── Focus-within tracking ─────────────────────────────────────── */
  const onFocusCapture = useCallback(() => setIsFocused(true), []);

  const onBlurCapture = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      // If focus moves to another element *inside* the wrapper, stay focused.
      if (
        wrapperRef.current &&
        e.relatedTarget instanceof Node &&
        wrapperRef.current.contains(e.relatedTarget)
      ) {
        return;
      }
      setIsFocused(false);
    },
    [],
  );

  return { wrapperRef, isFocused, onFocusCapture, onBlurCapture };
}

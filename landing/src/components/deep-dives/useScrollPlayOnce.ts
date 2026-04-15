import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Scroll-triggered one-shot play hook used by the feature deep-dives.
 *
 * Mirrors the `hasPlayedRef` + `IntersectionObserver` pattern originally
 * written inline in `ChatDeepDive.tsx`: when the observed node first
 * intersects the viewport past the given threshold, `hasPlayed` flips from
 * `false` → `true` exactly once. Scrolling away and back does NOT replay.
 *
 * Callers are expected to:
 *   - attach `ref` to their section's outer element
 *   - read `hasPlayed` to gate their scripted timeline
 *   - short-circuit with the "final state" when `prefers-reduced-motion`
 *     is reduced (this hook does not itself skip — the caller decides what
 *     "final state" means for its own timeline)
 *
 * The hook also guarantees a single-fire fallback for environments without
 * `IntersectionObserver` (older jsdom in tests, SSR-less environments) —
 * `hasPlayed` flips immediately on mount so timelines still run.
 */
export function useScrollPlayOnce<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.35,
): { ref: RefObject<T | null>; hasPlayed: boolean } {
  const ref = useRef<T | null>(null);
  const hasPlayedRef = useRef<boolean>(false);
  const [hasPlayed, setHasPlayed] = useState<boolean>(false);

  useEffect(() => {
    const node = ref.current;
    if (hasPlayedRef.current) return;

    // Fallback: no IntersectionObserver support — fire once on mount.
    // Defer the setState via microtask so we don't call it synchronously
    // from the effect body (avoids cascading-render lint warnings and
    // matches the async nature of the IO callback path below).
    if (!node || typeof IntersectionObserver === 'undefined') {
      hasPlayedRef.current = true;
      const t = setTimeout(() => setHasPlayed(true), 0);
      return () => clearTimeout(t);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasPlayedRef.current) {
            hasPlayedRef.current = true;
            setHasPlayed(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold },
    );
    io.observe(node);

    return () => io.disconnect();
  }, [threshold]);

  return { ref, hasPlayed };
}

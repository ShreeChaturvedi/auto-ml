import { useEffect, useRef, type ReactNode } from 'react';
import { useCursorOutline } from '@/lib/useCursorOutline';
import { cn } from '@/lib/cn';
import styles from './DeepDive.module.css';

interface DeepDiveProps {
  id: string;
  eyebrow: string;
  headlineBright: string;
  headlineMuted: string;
  body: string;
  kbdLabel?: string;
  kbdBadge?: string;
  reversed?: boolean;
  children: ReactNode;
}

/**
 * Shared wrapper for the three feature deep-dive sections (Section 4.5 of the
 * landing-page spec). Provides the 2-column alternating layout, the copy
 * stack (eyebrow / two-line headline / body / kbd hint), the cursor-outline
 * frame around the live component island, and a WAAPI enter animation that
 * fires once per section when it enters the viewport.
 */
export default function DeepDive({
  id,
  eyebrow,
  headlineBright,
  headlineMuted,
  body,
  kbdLabel,
  kbdBadge,
  reversed = false,
  children,
}: DeepDiveProps) {
  const { ref: visualRef } = useCursorOutline({ proximityThreshold: 200 });
  const sectionRef = useRef<HTMLElement | null>(null);

  // IntersectionObserver + WAAPI enter animation (spec 4.5: 500ms,
  // --ease-out-quart). Reduced motion is handled via the CSS fallback that
  // keeps the section at opacity: 1 so no JS work is needed.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      node.style.opacity = '1';
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      node.style.opacity = '1';
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const easing =
            getComputedStyle(node).getPropertyValue('--ease-out-quart').trim() ||
            'cubic-bezier(0.165, 0.84, 0.44, 1)';
          node.animate(
            [
              { opacity: 0, transform: 'translateY(24px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 500, easing, fill: 'forwards' },
          );
          observer.disconnect();
          break;
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const copy = (
    <div className={styles.copy}>
      <p className={styles.copyEyebrow}>{eyebrow}</p>
      <h2 className={styles.copyHeadline}>
        <span className={styles.copyHeadlineBright}>{headlineBright}</span>
        <span className={styles.copyHeadlineMuted}>{headlineMuted}</span>
      </h2>
      <p className={styles.copyBody}>{body}</p>
      {kbdLabel && kbdBadge && (
        <span className={styles.kbdHint}>
          <kbd className={styles.kbdBadge}>{kbdBadge}</kbd>
          {kbdLabel}
        </span>
      )}
    </div>
  );

  const visual = (
    <div
      ref={visualRef}
      className={`cursor-outline ${styles.visual}`}
      aria-label={`${eyebrow} demo`}
    >
      {children}
    </div>
  );

  return (
    <section
      id={id}
      ref={sectionRef}
      className={cn(styles.section, reversed && styles.sectionReversed)}
    >
      {reversed ? (
        <>
          {visual}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {visual}
        </>
      )}
    </section>
  );
}

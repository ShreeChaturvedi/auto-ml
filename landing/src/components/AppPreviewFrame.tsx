import { useCursorOutline } from '@/lib/useCursorOutline';
import { PreviewShell } from '@/preview/PreviewShell';
import styles from './AppPreviewFrame.module.css';

export default function AppPreviewFrame() {
  const { ref } = useCursorOutline({ proximityThreshold: 220 });

  return (
    <div className={styles.outer} id="product">
      {/*
       * The `cursor-outline` class lives on a wrapper that has NO overflow:hidden
       * so the ::before ring (inset: -24px) can bleed outside the visible frame
       * edge. The inner `.frame` keeps overflow:hidden + isolation so the app
       * preview's own overflow still clips cleanly. The outer glow PNG also
       * lives in the wrapper (outside the frame) so its -160px inset halo is
       * not clipped by the frame either.
       */}
      <div
        ref={ref}
        className={`cursor-outline ${styles.ringWrapper}`}
        aria-label="Interactive Agentic AutoML Platform demo"
      >
        {/* Outer monochrome glow — Gemini-deferred PNG (issue #310) with inline SVG fallback */}
        <div className={styles.glow} aria-hidden="true" />

        <div className={styles.frame}>
          {/* Inner grain overlay — stronger than the app's default body grain */}
          <div
            className={`landing-grain landing-grain-strong ${styles.innerGrain}`}
            aria-hidden="true"
          />
          <PreviewShell />
        </div>
      </div>
    </div>
  );
}

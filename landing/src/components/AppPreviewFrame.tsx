import { useCursorOutline } from '@/lib/useCursorOutline';
import { PreviewShell } from '@/preview/PreviewShell';
import styles from './AppPreviewFrame.module.css';

export default function AppPreviewFrame() {
  const { ref } = useCursorOutline({ proximityThreshold: 220 });

  return (
    <div className={styles.outer} id="product">
      <div
        ref={ref}
        className={`cursor-outline ${styles.frame}`}
        aria-label="Interactive Agentic AutoML Platform demo"
      >
        {/* Outer monochrome glow — Gemini-deferred PNG (issue #310) with inline SVG fallback */}
        <div className={styles.glow} aria-hidden="true" />

        {/* Inner grain overlay — stronger than the app's default body grain */}
        <div className={`landing-grain landing-grain-strong ${styles.innerGrain}`} aria-hidden="true" />

        <PreviewShell />
      </div>
    </div>
  );
}

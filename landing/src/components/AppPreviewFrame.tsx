import styles from './AppPreviewFrame.module.css';
import { PreviewLoop } from './previews/PreviewLoop';

export default function AppPreviewFrame() {
  return (
    <div className={styles.outer} id="product">
      <div
        className={styles.ringWrapper}
        aria-label="Interactive Agentic AutoML Platform demo"
      >
        <div className={`${styles.frame} app-preview-frame`}>
          {/* Outer monochrome glow — Gemini-deferred PNG (issue #310) with
              inline SVG fallback. Lives INSIDE .frame so .frame's
              overflow:hidden clips the -160px halo. */}
          <div className={styles.glow} aria-hidden="true" />
          {/* Inner grain overlay — stronger than the app's default body grain */}
          <div
            className={`landing-grain landing-grain-strong ${styles.innerGrain}`}
            aria-hidden="true"
          />
          <PreviewLoop
            previewId="hero-montage"
            className={styles.previewMedia}
            testId="hero-preview-loop"
          />
        </div>
      </div>
    </div>
  );
}

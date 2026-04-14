import { useEffect, useState, type ComponentType } from 'react';
import styles from './AppPreviewFrame.module.css';

export default function AppPreviewFrame() {
  const [DemoWorkspaceComponent, setDemoWorkspaceComponent] = useState<ComponentType<{ initialPhase?: string }> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void import('@frontend/demo/landing').then((module) => {
      if (!cancelled) {
        setDemoWorkspaceComponent(() => module.DemoWorkspace);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.outer} id="product">
      <div
        className={styles.ringWrapper}
        aria-label="Interactive Agentic AutoML Platform demo"
      >
        <div className={styles.frame}>
          {/* Outer monochrome glow — Gemini-deferred PNG (issue #310) with
              inline SVG fallback. Lives INSIDE .frame so .frame's
              overflow:hidden clips the -160px halo. */}
          <div className={styles.glow} aria-hidden="true" />
          {/* Inner grain overlay — stronger than the app's default body grain */}
          <div
            className={`landing-grain landing-grain-strong ${styles.innerGrain}`}
            aria-hidden="true"
          />
          {DemoWorkspaceComponent ? (
            <DemoWorkspaceComponent initialPhase="upload" />
          ) : (
            <div className="h-full bg-background" data-testid="landing-demo-loading" />
          )}
        </div>
      </div>
    </div>
  );
}

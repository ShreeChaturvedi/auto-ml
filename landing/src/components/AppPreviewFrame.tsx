import { useEffect, useState, type ComponentType } from 'react';
import { useCursorOutline } from '@/lib/useCursorOutline';
import styles from './AppPreviewFrame.module.css';

export default function AppPreviewFrame() {
  const { ref } = useCursorOutline({ proximityThreshold: 220 });
  const [DemoWorkspaceComponent, setDemoWorkspaceComponent] = useState<ComponentType | null>(null);

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
        <div className={styles.frame}>
          {/* Outer monochrome glow — Gemini-deferred PNG (issue #310) with
              inline SVG fallback. Lives INSIDE .frame so .frame's
              overflow:hidden clips the -160px halo and it cannot contribute
              to document scroll. The cursor-reactive .cursor-outline ::before
              ring still extends past the frame edge for the interactive halo. */}
          <div className={styles.glow} aria-hidden="true" />
          {/* Inner grain overlay — stronger than the app's default body grain */}
          <div
            className={`landing-grain landing-grain-strong ${styles.innerGrain}`}
            aria-hidden="true"
          />
          {DemoWorkspaceComponent ? (
            <DemoWorkspaceComponent />
          ) : (
            <div className="h-full bg-background" data-testid="landing-demo-loading" />
          )}
        </div>
      </div>
    </div>
  );
}

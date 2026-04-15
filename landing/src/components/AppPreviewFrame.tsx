import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import styles from './AppPreviewFrame.module.css';

export default function AppPreviewFrame() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false);
  const [DemoWorkspaceComponent, setDemoWorkspaceComponent] = useState<ComponentType<{ initialPhase?: string }> | null>(null);

  useEffect(() => {
    if (shouldLoadPreview) {
      return;
    }

    let cancelled = false;
    let fallbackTimer = 0;
    let observer: IntersectionObserver | null = null;

    const beginLoading = () => {
      if (!cancelled) {
        setShouldLoadPreview(true);
      }
    };

    fallbackTimer = window.setTimeout(beginLoading, 250);

    if (typeof IntersectionObserver === 'function' && frameRef.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            beginLoading();
            observer?.disconnect();
          }
        },
        { rootMargin: '300px 0px' },
      );
      observer.observe(frameRef.current);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      observer?.disconnect();
    };
  }, [shouldLoadPreview]);

  useEffect(() => {
    if (!shouldLoadPreview) {
      return;
    }

    let cancelled = false;

    void import('@frontend/demo/landing').then((module) => {
      if (!cancelled) {
        startTransition(() => {
          setDemoWorkspaceComponent(() => module.DemoWorkspace);
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoadPreview]);

  return (
    <div ref={frameRef} className={styles.outer} id="product">
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

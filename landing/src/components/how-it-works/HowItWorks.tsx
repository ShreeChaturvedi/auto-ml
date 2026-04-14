import { Suspense, lazy, useEffect, useRef, useState, type ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { PHASE_SCENES, type PhaseScene as PhaseSceneData } from './scenes';
import styles from './HowItWorks.module.css';

// Lazy-load the 7 diorama components so their JS (and Recharts pulled in by
// Train/Deploy) is only fetched when the user actually scrolls into this
// section. IntersectionObserver inside each diorama already gates ambient
// intervals, so eager-rendered dioramas off-screen are idle — this change
// further ensures the bytes themselves don't ship in the initial HowItWorks
// chunk.
const IngestDiorama = lazy(() =>
  import('./dioramas/IngestDiorama').then((m) => ({ default: m.IngestDiorama })),
);
const ExploreDiorama = lazy(() =>
  import('./dioramas/ExploreDiorama').then((m) => ({ default: m.ExploreDiorama })),
);
const PreprocessDiorama = lazy(() =>
  import('./dioramas/PreprocessDiorama').then((m) => ({ default: m.PreprocessDiorama })),
);
const EngineerDiorama = lazy(() =>
  import('./dioramas/EngineerDiorama').then((m) => ({ default: m.EngineerDiorama })),
);
const TrainDiorama = lazy(() =>
  import('./dioramas/TrainDiorama').then((m) => ({ default: m.TrainDiorama })),
);
const ExperimentsDiorama = lazy(() =>
  import('./dioramas/ExperimentsDiorama').then((m) => ({ default: m.ExperimentsDiorama })),
);
const DeployDiorama = lazy(() =>
  import('./dioramas/DeployDiorama').then((m) => ({ default: m.DeployDiorama })),
);

const DIORAMA_MAP: Record<PhaseSceneData['dioramaId'], ComponentType> = {
  ingest:      IngestDiorama,
  explore:     ExploreDiorama,
  preprocess:  PreprocessDiorama,
  engineer:    EngineerDiorama,
  train:       TrainDiorama,
  experiments: ExperimentsDiorama,
  deploy:      DeployDiorama,
};

interface PhaseSceneProps {
  scene: PhaseSceneData;
  showDiorama?: boolean;
}

// File-local shared scene markup. Both the reduced-motion static list and
// the pinned scrollytelling grid render this so the per-scene DOM is
// identical (counter + headline + diorama).
function PhaseScene({ scene, showDiorama = true }: PhaseSceneProps) {
  const Diorama = DIORAMA_MAP[scene.dioramaId];
  return (
    <>
      <div className={styles.sceneCounter}>
        {String(scene.index).padStart(2, '0')} /{' '}
        {String(scene.total).padStart(2, '0')}
      </div>
      <h3 className={styles.sceneHeadline}>
        <span className={styles.sceneHeadlineBright}>{scene.headlineBright}</span>
        <span className={styles.sceneHeadlineMuted}>{scene.headlineMuted}</span>
      </h3>
      <div className={styles.sceneDiorama}>
        {showDiorama ? (
          <Suspense fallback={<div className={styles.sceneFallback} aria-hidden />}>
            <Diorama />
          </Suspense>
        ) : (
          <div className={styles.sceneFallback} aria-hidden />
        )}
      </div>
    </>
  );
}

export default function HowItWorks() {
  const reducedMotion = usePrefersReducedMotion();
  const pinRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const prevIdxRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shouldLoadDiorama, setShouldLoadDiorama] = useState(false);

  useEffect(() => {
    if (!pinRef.current || shouldLoadDiorama) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoadDiorama(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px 0px' },
    );

    observer.observe(pinRef.current);
    return () => observer.disconnect();
  }, [shouldLoadDiorama]);

  useEffect(() => {
    if (reducedMotion || !pinRef.current) return;

    let scrollTrigger: { kill: () => void } | null = null;
    let cancelled = false;

    // Lazy-load GSAP + ScrollTrigger only on this section so users who never
    // scroll here (or who have reduced motion enabled) never pay the cost.
    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled || !pinRef.current) return;

      gsap.registerPlugin(ScrollTrigger);

      scrollTrigger = ScrollTrigger.create({
        trigger: pinRef.current,
        start: 'top top',
        end: '+=600%',
        pin: true,
        pinSpacing: true,
        scrub: false,
        onUpdate: (self) => {
          const progress = self.progress;
          const idx = Math.min(
            PHASE_SCENES.length - 1,
            Math.floor(progress * PHASE_SCENES.length),
          );
          // Short-circuit: onUpdate fires every scroll frame. React will
          // bail out of identical setState calls, but the closure + diff
          // are still wasteful at scroll rate. A ref compare is free.
          if (idx !== prevIdxRef.current) {
            prevIdxRef.current = idx;
            setActiveIndex(idx);
          }
          if (progressBarRef.current) {
            progressBarRef.current.style.transform = `scaleX(${progress})`;
          }
        },
      }) as unknown as { kill: () => void };
    })();

    return () => {
      cancelled = true;
      scrollTrigger?.kill();
    };
  }, [reducedMotion]);

  // Reduced-motion fallback: render as a static vertical stack.
  // Every scene is fully present in the DOM and keyboard/screen-reader
  // accessible.
  if (reducedMotion) {
    return (
      <section id="how-it-works" aria-labelledby="how-it-works-heading">
        <div className={styles.intro}>
          <p className={styles.introEyebrow}>HOW IT WORKS</p>
          <h2 className={styles.introHeadline} id="how-it-works-heading">
            From raw data to a deployed model
            <span className={styles.introHeadlineMuted}>
              in seven agent-driven phases.
            </span>
          </h2>
        </div>
        <ol className={styles.fallbackList}>
          {PHASE_SCENES.map((scene) => (
            <li key={scene.code} className={styles.fallbackItem}>
              <span className={styles.fallbackCode}>{scene.code}</span>
              <figure className={styles.fallbackFigure}>
                <PhaseScene scene={scene} showDiorama={false} />
              </figure>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  // Pinned scrollytelling (no-preference / default)
  const progressPct = Math.round(((activeIndex + 1) / PHASE_SCENES.length) * 100);

  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading">
      <div className={styles.intro}>
        <p className={styles.introEyebrow}>HOW IT WORKS</p>
        <h2 className={styles.introHeadline} id="how-it-works-heading">
          From raw data to a deployed model
          <span className={styles.introHeadlineMuted}>
            in seven agent-driven phases.
          </span>
        </h2>
      </div>

      <div ref={pinRef} className={styles.pinContainer}>
        <div className={styles.pinGrid}>
          <nav aria-label="Workflow phases">
            <ol className={styles.toc} role="tablist">
              {PHASE_SCENES.map((scene, i) => (
                <li key={scene.code}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeIndex === i}
                    className={cn(
                      styles.tocItem,
                      activeIndex === i && styles.tocItemActive,
                    )}
                    onClick={() => {
                      prevIdxRef.current = i;
                      setActiveIndex(i);
                    }}
                  >
                    {scene.code}
                  </button>
                </li>
              ))}
            </ol>
            <div
              className={styles.tocProgressWrap}
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Section progress"
            >
              <div ref={progressBarRef} className={styles.tocProgress} />
            </div>
          </nav>

          <div className={styles.sceneWrap}>
            <figure className={cn(styles.scene, styles.sceneActive)}>
              <PhaseScene scene={PHASE_SCENES[activeIndex]} showDiorama={shouldLoadDiorama} />
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

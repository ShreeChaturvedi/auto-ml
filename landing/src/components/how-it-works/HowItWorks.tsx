import { useEffect, useRef, useState, type ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { PHASE_SCENES, type PhaseScene } from './scenes';
import { IngestDiorama } from './dioramas/IngestDiorama';
import { ExploreDiorama } from './dioramas/ExploreDiorama';
import { PreprocessDiorama } from './dioramas/PreprocessDiorama';
import { EngineerDiorama } from './dioramas/EngineerDiorama';
import { TrainDiorama } from './dioramas/TrainDiorama';
import { ExperimentsDiorama } from './dioramas/ExperimentsDiorama';
import { DeployDiorama } from './dioramas/DeployDiorama';
import styles from './HowItWorks.module.css';

const DIORAMA_MAP: Record<PhaseScene['dioramaId'], ComponentType> = {
  ingest:      IngestDiorama,
  explore:     ExploreDiorama,
  preprocess:  PreprocessDiorama,
  engineer:    EngineerDiorama,
  train:       TrainDiorama,
  experiments: ExperimentsDiorama,
  deploy:      DeployDiorama,
};

export default function HowItWorks() {
  const reducedMotion = usePrefersReducedMotion();
  const pinRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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
          setActiveIndex(idx);
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
  // Every scene (counter + headline + diorama) is fully present in the DOM
  // and keyboard/screen-reader accessible.
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
          {PHASE_SCENES.map((scene) => {
            const Diorama = DIORAMA_MAP[scene.dioramaId];
            return (
              <li key={scene.code} className={styles.fallbackItem}>
                <span className={styles.fallbackCode}>{scene.code}</span>
                <figure style={{ margin: 0 }}>
                  <h3 className={styles.fallbackHeadline}>
                    <span className={styles.sceneHeadlineBright}>
                      {scene.headlineBright}
                    </span>
                    <span className={styles.sceneHeadlineMuted}>
                      {scene.headlineMuted}
                    </span>
                  </h3>
                  <div className={styles.sceneDiorama}>
                    <Diorama />
                  </div>
                </figure>
              </li>
            );
          })}
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
                    onClick={() => setActiveIndex(i)}
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
            {PHASE_SCENES.map((scene, i) => {
              const Diorama = DIORAMA_MAP[scene.dioramaId];
              return (
                <figure
                  key={scene.code}
                  className={cn(
                    styles.scene,
                    activeIndex === i && styles.sceneActive,
                  )}
                  aria-hidden={activeIndex !== i}
                  style={{ margin: 0 }}
                >
                  <div className={styles.sceneCounter}>
                    {String(scene.index).padStart(2, '0')} /{' '}
                    {String(scene.total).padStart(2, '0')}
                  </div>
                  <h3 className={styles.sceneHeadline}>
                    <span className={styles.sceneHeadlineBright}>
                      {scene.headlineBright}
                    </span>
                    <span className={styles.sceneHeadlineMuted}>
                      {scene.headlineMuted}
                    </span>
                  </h3>
                  <div className={styles.sceneDiorama}>
                    <Diorama />
                  </div>
                </figure>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

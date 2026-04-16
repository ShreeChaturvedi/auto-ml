import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { PHASE_SCENES, type PhaseScene as PhaseSceneData } from './scenes';
import { WorkspaceDiorama } from './dioramas/WorkspaceDiorama';
import type { Phase } from '@frontend/types/phase';
import styles from './HowItWorks.module.css';

const DIORAMA_META: Record<PhaseSceneData['dioramaId'], { label: string; phase: Phase }> = {
  ingest: {
    label: '1.0 INGEST — real workspace preview',
    phase: 'upload',
  },
  explore: {
    label: '2.0 EXPLORE — real data viewer',
    phase: 'data-viewer',
  },
  preprocess: {
    label: '3.0 PREPROCESS — real preprocessing workspace',
    phase: 'preprocessing',
  },
  engineer: {
    label: '4.0 ENGINEER — real feature workspace',
    phase: 'feature-engineering',
  },
  train: {
    label: '5.0 TRAIN — real training workspace',
    phase: 'training',
  },
  experiments: {
    label: '6.0 EXPERIMENTS — real leaderboard workspace',
    phase: 'experiments',
  },
  deploy: {
    label: '7.0 DEPLOY — real deployment workspace',
    phase: 'deployment',
  },
};

interface PhaseSceneProps {
  scene: PhaseSceneData;
  autoplayDiorama?: boolean;
  preloadAllDioramaPhases?: boolean;
}

// File-local shared scene markup. Both the reduced-motion static list and
// the pinned scrollytelling grid render this so the per-scene DOM is
// identical (counter + headline + diorama).
function PhaseScene({
  scene,
  autoplayDiorama = true,
  preloadAllDioramaPhases = true,
}: PhaseSceneProps) {
  const diorama = DIORAMA_META[scene.dioramaId];
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
        <WorkspaceDiorama
          label={diorama.label}
          phase={diorama.phase}
          autoplay={autoplayDiorama}
          preloadAll={preloadAllDioramaPhases}
        />
      </div>
    </>
  );
}

export default function HowItWorks() {
  const reducedMotion = usePrefersReducedMotion();
  const pinRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLOListElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const prevIdxRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-scroll the horizontal pill strip to keep the active item visible.
  // Only fires when the strip is actually scrollable (mobile), avoiding
  // unnecessary scroll-geometry computation on desktop's vertical TOC.
  useEffect(() => {
    const toc = tocRef.current;
    if (!toc || toc.scrollWidth <= toc.clientWidth) return;
    const active = toc.children[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeIndex]);

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
                <PhaseScene
                  scene={scene}
                  autoplayDiorama={false}
                  preloadAllDioramaPhases={false}
                />
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
            <ol ref={tocRef} className={styles.toc} role="tablist">
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
              <PhaseScene scene={PHASE_SCENES[activeIndex]} />
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}

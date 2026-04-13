import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import styles from './Diorama.module.css';

const MODELS = [
  { name: 'xgboost_v3',   finalF1: 0.9117, isChamp: true },
  { name: 'lightgbm_v2',  finalF1: 0.9002, isChamp: false },
  { name: 'rf_v1',        finalF1: 0.8611, isChamp: false },
  { name: 'logistic_v1',  finalF1: 0.7904, isChamp: false },
];

export function TrainDiorama() {
  // Ambient sparkline-like breath — gated behind an IntersectionObserver so
  // the 5 Hz re-render only burns frames while the diorama is on-screen.
  const frameRef = useRef<HTMLDivElement>(null);
  // Default to `true` in environments without IntersectionObserver (SSR,
  // jsdom) so tests and non-IO browsers still animate rather than freeze.
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <div ref={frameRef} className={styles.frame}>
      <div className={styles.label}>5.0 TRAIN — 4 classifiers in parallel</div>
      <div style={{ marginTop: 12, background: 'var(--surface-1)', border: '0.8px solid var(--border)', borderRadius: 8 }}>
        {MODELS.map((m, i) => {
          const width = m.finalF1 * 100 + Math.sin(tick / 3 + i) * 0.4;
          return (
            <div key={m.name} className={styles.modelRow}>
              <span style={{ color: 'var(--text-dim)', fontFamily: 'Geist Mono Variable', fontSize: 11 }}>
                {i + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: '0 0 120px' }}>{m.name}</span>
                <span className={styles.barTrack}>
                  <span className={styles.barFill} style={{ width: `${width}%` }} />
                </span>
              </div>
              <span style={{ textAlign: 'right', fontFamily: 'Geist Mono Variable', fontSize: 11 }}>
                {m.finalF1.toFixed(4)}
                {m.isChamp && <Star size={10} fill="currentColor" className={styles.modelRowChamp} aria-label="champion" style={{ marginLeft: 4 }} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

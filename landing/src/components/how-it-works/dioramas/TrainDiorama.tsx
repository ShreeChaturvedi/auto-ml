import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import styles from './Diorama.module.css';

const MODELS = [
  { name: 'xgboost_v3',   finalF1: 0.9117, isChamp: true },
  { name: 'lightgbm_v2',  finalF1: 0.9002, isChamp: false },
  { name: 'rf_v1',        finalF1: 0.8611, isChamp: false },
  { name: 'logistic_v1',  finalF1: 0.7904, isChamp: false },
];

export function TrainDiorama() {
  // Ambient sparkline-like breath
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.frame}>
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

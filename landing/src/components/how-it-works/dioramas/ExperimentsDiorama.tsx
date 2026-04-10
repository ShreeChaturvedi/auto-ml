import { Star } from 'lucide-react';
import styles from './Diorama.module.css';

const TOP3 = [
  { rank: 1, name: 'xgboost_v3',  f1: 0.9117, isChamp: true },
  { rank: 2, name: 'lightgbm_v2', f1: 0.9002, isChamp: false },
  { rank: 3, name: 'rf_v1',       f1: 0.8611, isChamp: false },
];

const FEATURES = [
  { name: 'recency_days',           value: 0.82 },
  { name: 'mrr_delta_30d',          value: 0.71 },
  { name: 'ticket_escalation_rate', value: 0.58 },
];

export function ExperimentsDiorama() {
  return (
    <div className={styles.frame}>
      <div className={styles.label}>6.0 EXPERIMENTS — ranked champion + SHAP</div>
      <div style={{ background: 'var(--surface-1)', border: '0.8px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
        {TOP3.map((m) => (
          <div key={m.name} className={styles.modelRow}>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'Geist Mono Variable', fontSize: 11 }}>{m.rank}</span>
            <span>
              {m.name}
              {m.isChamp && <Star size={10} fill="currentColor" className={styles.modelRowChamp} aria-label="champion" style={{ marginLeft: 4 }} />}
            </span>
            <span style={{ textAlign: 'right', fontFamily: 'Geist Mono Variable', fontSize: 11 }}>{m.f1.toFixed(3)}</span>
          </div>
        ))}
      </div>
      <div className={styles.label} style={{ marginBottom: 6 }}>SHAP — xgboost_v3</div>
      {FEATURES.map((f) => (
        <div key={f.name} className={styles.bar}>
          <span className={styles.barName}>{f.name}</span>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: `${f.value * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

import styles from './Diorama.module.css';

const FEATURES = [
  { name: 'recency_days',           value: 0.82 },
  { name: 'mrr_delta_30d',          value: 0.71 },
  { name: 'ticket_escalation_rate', value: 0.58 },
  { name: 'plan_tier=Starter',      value: 0.44 },
  { name: 'logins_sum',             value: 0.38 },
  { name: 'api_calls_p95',          value: 0.29 },
  { name: 'satisfaction_score',     value: 0.22 },
  { name: 'seats_purchased',        value: 0.18 },
];

export function EngineerDiorama() {
  return (
    <div className={styles.frame}>
      <div className={styles.label}>4.0 ENGINEER — top 8 by mutual information</div>
      <div style={{ marginTop: 12 }}>
        {FEATURES.map((f) => (
          <div key={f.name} className={styles.bar}>
            <span className={styles.barName}>{f.name}</span>
            <span className={styles.barTrack}>
              <span className={styles.barFill} style={{ width: `${f.value * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

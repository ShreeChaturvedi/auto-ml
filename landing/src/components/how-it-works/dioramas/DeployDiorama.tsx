import { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import styles from './Diorama.module.css';

// Ambient latency data — breathes slowly
function useAmbientData() {
  const [data, setData] = useState(() =>
    Array.from({ length: 40 }).map((_, i) => ({ t: i, v: 22 + Math.sin(i / 4) * 3 })),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setData((prev) => [
        ...prev.slice(1),
        { t: prev[prev.length - 1].t + 1, v: 22 + Math.sin((prev[prev.length - 1].t + 1) / 4) * 3 + Math.random() * 2 },
      ]);
    }, 1500);
    return () => clearInterval(id);
  }, []);
  return data;
}

export function DeployDiorama() {
  const data = useAmbientData();
  const [p95, setP95] = useState(58);
  useEffect(() => {
    const id = setInterval(() => setP95((p) => 56 + Math.round(Math.random() * 6)), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={styles.frame}>
      <div className={styles.label}>7.0 DEPLOY — live endpoint</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span style={{ fontSize: 13 }}>xgboost_v3 · v3.2.1</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'Geist Mono Variable', fontSize: 11, color: 'var(--text-muted)' }}>
          p95 {p95}ms
        </span>
      </div>
      <div style={{ fontFamily: 'Geist Mono Variable', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        POST /models/novacraft-churn/v3/predict
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <Line type="monotone" dataKey="v" stroke="#F7F8F8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

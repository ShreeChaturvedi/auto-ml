import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import styles from './Diorama.module.css';

// Ambient latency data — breathes slowly. Only ticks while the diorama is
// on-screen (gated by the parent's IntersectionObserver flag) so off-screen
// scenes don't mutate a 40-point array + trigger Recharts re-renders.
function useAmbientData(active: boolean) {
  const [data, setData] = useState(() =>
    Array.from({ length: 40 }).map((_, i) => ({ t: i, v: 22 + Math.sin(i / 4) * 3 })),
  );
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setData((prev) => [
        ...prev.slice(1),
        { t: prev[prev.length - 1].t + 1, v: 22 + Math.sin((prev[prev.length - 1].t + 1) / 4) * 3 + Math.random() * 2 },
      ]);
    }, 1500);
    return () => clearInterval(id);
  }, [active]);
  return data;
}

export function DeployDiorama() {
  const frameRef = useRef<HTMLDivElement>(null);
  // Default to `true` in environments without IntersectionObserver (SSR,
  // jsdom) so tests and non-IO browsers still animate rather than freeze.
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );

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

  const data = useAmbientData(visible);
  const [p95, setP95] = useState(58);
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setP95(() => 56 + Math.round(Math.random() * 6)), 2000);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <div ref={frameRef} className={styles.frame}>
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

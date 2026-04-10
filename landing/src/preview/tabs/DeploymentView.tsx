import { cn } from '@/lib/cn';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import { usePreviewStore } from '@/preview/previewStore';
import {
  mockDeployment, mockLogs, mockLatencyHistory, mockRpsHistory, mockErrorHistory,
} from '@/preview/fixtures/deployment';
import type { DeploymentSubTab } from '@/preview/types';
import styles from './DeploymentView.module.css';

const SUB_TABS: { id: DeploymentSubTab; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'playground', label: 'Playground' },
  { id: 'api',        label: 'API' },
  { id: 'logs',       label: 'Logs' },
  { id: 'monitoring', label: 'Monitoring' },
];

export function DeploymentView() {
  const activeSub = usePreviewStore((s) => s.deployment.activeSubTab);
  const setSub = usePreviewStore((s) => s.setDeploymentSubTab);

  return (
    <div className={styles.root}>
      <nav className={styles.subTabs} role="tablist" aria-label="Deployment sections">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeSub === t.id}
            className={cn(styles.subTab, activeSub === t.id && styles.subTabActive)}
            onClick={() => setSub(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {activeSub === 'overview' && <OverviewPanel />}
        {activeSub === 'playground' && <PlaygroundPanel />}
        {activeSub === 'api' && <ApiPanel />}
        {activeSub === 'logs' && <LogsPanel />}
        {activeSub === 'monitoring' && <MonitoringPanel />}
      </div>
    </div>
  );
}

function OverviewPanel() {
  return (
    <>
      <div className={styles.statusRow}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span className={styles.statusLabel}>Healthy · {mockDeployment.modelName}</span>
        <span className={styles.statusVersion}>{mockDeployment.version}</span>
      </div>

      <div className={styles.overviewGrid}>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>p50</div>
          <div className={styles.statValue}>{mockDeployment.p50Ms}<span className={styles.statUnit}>ms</span></div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>p95</div>
          <div className={styles.statValue}>{mockDeployment.p95Ms}<span className={styles.statUnit}>ms</span></div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>RPS</div>
          <div className={styles.statValue}>{mockDeployment.rps}</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>error rate</div>
          <div className={styles.statValue}>{(mockDeployment.errorRate * 100).toFixed(2)}<span className={styles.statUnit}>%</span></div>
        </div>
      </div>

      <div className={styles.endpointBlock}>
        POST {mockDeployment.endpoint}
      </div>
    </>
  );
}

function PlaygroundPanel() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div className={styles.statTile}>
        <div className={styles.statLabel}>INPUT (JSON)</div>
        <pre style={{ fontFamily: 'Geist Mono Variable, monospace', fontSize: 12, color: 'var(--text)', margin: 0, marginTop: 8, whiteSpace: 'pre-wrap' }}>{`{
  "customer_id": "NC-01492",
  "recency_days": 34,
  "mrr_delta_30d": -18,
  "ticket_escalation_rate": 0.12
}`}</pre>
      </div>
      <div className={styles.statTile}>
        <div className={styles.statLabel}>OUTPUT</div>
        <pre style={{ fontFamily: 'Geist Mono Variable, monospace', fontSize: 12, color: 'var(--text)', margin: 0, marginTop: 8, whiteSpace: 'pre-wrap' }}>{`{
  "churn_probability": 0.8721,
  "predicted_class": true,
  "latency_ms": 23,
  "model_version": "v3.2.1"
}`}</pre>
      </div>
    </div>
  );
}

function ApiPanel() {
  return (
    <div className={styles.endpointBlock} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
      {`curl -X POST ${mockDeployment.endpoint} \\
  -H "Authorization: Bearer $AGENTIC_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"customer_id": "NC-01492", "recency_days": 34}'`}
    </div>
  );
}

function LogsPanel() {
  return (
    <div className={styles.logsBlock} role="log" aria-live="polite" aria-label="Deployment logs">
      {mockLogs.map((log, i) => (
        <div key={i} className={styles.logRow}>
          <span className={styles.logTime}>{log.timestamp}</span>
          <span className={cn(styles.logLevel, styles[`logLevel${log.level}`])}>{log.level}</span>
          <span className={styles.logMsg}>{log.message}</span>
        </div>
      ))}
    </div>
  );
}

function MonitoringPanel() {
  return (
    <div className={styles.chartsGrid}>
      <div className={styles.chartCard}>
        <h4 className={styles.chartCardTitle}>Latency (ms)</h4>
        <div style={{ height: 160 }}>
          <ResponsiveContainer>
            <LineChart data={mockLatencyHistory}>
              <XAxis dataKey="t" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Line type="monotone" dataKey="p50" stroke="#F7F8F8" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="p95" stroke="#8A8F98" strokeWidth={1.5} dot={false} />
              <RTooltip contentStyle={{ background: 'var(--surface-2)', border: '0.8px solid var(--border)', fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h4 className={styles.chartCardTitle}>Requests per second</h4>
        <div style={{ height: 160 }}>
          <ResponsiveContainer>
            <LineChart data={mockRpsHistory}>
              <XAxis dataKey="t" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Line type="monotone" dataKey="rps" stroke="#F7F8F8" strokeWidth={1.5} dot={false} />
              <RTooltip contentStyle={{ background: 'var(--surface-2)', border: '0.8px solid var(--border)', fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h4 className={styles.chartCardTitle}>Error rate</h4>
        <div style={{ height: 160 }}>
          <ResponsiveContainer>
            <LineChart data={mockErrorHistory}>
              <XAxis dataKey="t" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Line type="monotone" dataKey="rate" stroke="#F7F8F8" strokeWidth={1.5} dot={false} />
              <RTooltip contentStyle={{ background: 'var(--surface-2)', border: '0.8px solid var(--border)', fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

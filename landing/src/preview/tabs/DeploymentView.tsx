import { useState } from 'react';
import {
  LayoutDashboard, FlaskConical, Code, Logs as LogsIcon, Activity, Copy, Play, ExternalLink,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/cn';
import { usePreviewStore } from '@/preview/previewStore';
import type { DeploymentSubTab } from '@/preview/types';
import {
  mockDeployment,
  mockRecentRequests,
  mockPlaygroundInputs,
  mockPlaygroundResponse,
  mockCurlSnippet,
  mockRequestSchema,
  mockResponseSchema,
  mockLogs,
  mockLatencyHistory,
  mockRpsHistory,
  mockErrorHistory,
} from '@/preview/fixtures/deployment';
import styles from './DeploymentView.module.css';

/* ────────────────────────────────────────────────────────────── */
/*  Sub-tab chrome                                                 */
/* ────────────────────────────────────────────────────────────── */

const SUB_TABS: { id: DeploymentSubTab; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: 'overview',   label: 'Overview',   Icon: LayoutDashboard },
  { id: 'playground', label: 'Playground', Icon: FlaskConical },
  { id: 'api',        label: 'API',        Icon: Code },
  { id: 'logs',       label: 'Logs',       Icon: LogsIcon },
  { id: 'monitoring', label: 'Monitoring', Icon: Activity },
];

/* ────────────────────────────────────────────────────────────── */
/*  Recharts shared style                                          */
/* ────────────────────────────────────────────────────────────── */

const CHART_TICK_STYLE = { fill: '#62666D', fontSize: 10 } as const;
const CHART_TOOLTIP_STYLE = {
  background: '#1A1B1D',
  border: '0.8px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  fontSize: 11,
  color: '#F7F8F8',
} as const;
const CHART_TOOLTIP_ITEM_STYLE = { color: '#F7F8F8' } as const;
const CHART_TOOLTIP_LABEL_STYLE = { color: '#8A8F98' } as const;

/* ────────────────────────────────────────────────────────────── */
/*  Main view                                                      */
/* ────────────────────────────────────────────────────────────── */

export function DeploymentView() {
  const activeSub = usePreviewStore((s) => s.deployment.activeSubTab);
  const setSub    = usePreviewStore((s) => s.setDeploymentSubTab);

  return (
    <div className={styles.root}>
      {/* Toolbar / ribbon */}
      <div className={styles.ribbon}>
        <div className={styles.ribbonLeft}>
          <span className={styles.deploymentName}>{mockDeployment.modelName}</span>
          <span className={styles.deploymentVersion}>{mockDeployment.version}</span>
          <span className={styles.deploymentStatus}>
            <span className={styles.statusDot} aria-hidden="true" />
            HEALTHY
          </span>
        </div>
        <nav className={styles.subTabs} role="tablist" aria-label="Deployment sections">
          {SUB_TABS.map((t) => {
            const isActive = activeSub === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={cn(styles.subTab, isActive && styles.subTabActive)}
                onClick={() => setSub(t.id)}
              >
                <t.Icon className={styles.subTabIcon} aria-hidden="true" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeSub === 'overview'   && <OverviewPanel />}
        {activeSub === 'playground' && <PlaygroundPanel />}
        {activeSub === 'api'        && <ApiPanel />}
        {activeSub === 'logs'       && <LogsPanel />}
        {activeSub === 'monitoring' && <MonitoringPanel />}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Overview                                                       */
/* ────────────────────────────────────────────────────────────── */

function OverviewPanel() {
  return (
    <div className={styles.overview}>
      {/* Three status cards */}
      <div className={styles.statusCards}>
        <div className={styles.statusCard}>
          <div className={styles.statusCardLabel}>Endpoint</div>
          <div className={styles.endpointRow}>
            <code className={styles.endpointUrl}>{mockDeployment.endpoint}</code>
            <button type="button" className={styles.iconBtn} aria-label="Copy endpoint URL">
              <Copy className={styles.iconBtnIcon} />
            </button>
            <button type="button" className={styles.iconBtn} aria-label="Open endpoint">
              <ExternalLink className={styles.iconBtnIcon} />
            </button>
          </div>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusCardLabel}>p95 Latency</div>
          <div className={styles.statusCardValue}>
            {mockDeployment.p95Ms}
            <span className={styles.statusCardUnit}>ms</span>
          </div>
          <div className={styles.statusCardSub}>p50 {mockDeployment.p50Ms}ms · p99 {mockDeployment.p99Ms}ms</div>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusCardLabel}>Requests / sec</div>
          <div className={styles.statusCardValue}>{mockDeployment.rps}</div>
          <div className={styles.statusCardSub}>
            error rate {(mockDeployment.errorRate * 100).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Metadata grid */}
      <dl className={styles.metaGrid}>
        <dt>Model</dt>
        <dd>
          {mockDeployment.modelName}
          <span className={styles.metaMuted}> ({mockDeployment.modelFamily})</span>
        </dd>
        <dt>Version</dt>
        <dd>{mockDeployment.version}</dd>
        <dt>Deployed</dt>
        <dd>{mockDeployment.deployedAgo}</dd>
        <dt>Region</dt>
        <dd>{mockDeployment.region}</dd>
        <dt>Uptime</dt>
        <dd>{mockDeployment.uptime}</dd>
      </dl>

      {/* Recent requests table */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Recent requests</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Request ID</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Prediction</th>
              </tr>
            </thead>
            <tbody>
              {mockRecentRequests.map((r) => (
                <tr key={r.id}>
                  <td className={styles.tdMono}>{r.time}</td>
                  <td className={styles.tdMono}>{r.id}</td>
                  <td>
                    <span className={cn(styles.statusBadge, r.status === 200 ? styles.statusOk : styles.statusErr)}>
                      {r.status}
                    </span>
                  </td>
                  <td className={styles.tdMono}>{r.latencyMs}ms</td>
                  <td className={styles.tdMono}>{r.prediction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Playground                                                     */
/* ────────────────────────────────────────────────────────────── */

function PlaygroundPanel() {
  // Local form state — controlled, no-op on submit.
  const [values, setValues] = useState<Record<string, string | number>>(() =>
    Object.fromEntries(mockPlaygroundInputs.map((f) => [f.name, f.value])),
  );

  const handleChange = (name: string, next: string | number) =>
    setValues((prev) => ({ ...prev, [name]: next }));

  return (
    <div className={styles.playground}>
      {/* Left: input form */}
      <div className={styles.playgroundCard}>
        <div className={styles.cardHeader}>
          <span className={styles.cardEyebrow}>INPUT</span>
          <span className={styles.cardHeaderHint}>4 features</span>
        </div>
        <form
          className={styles.playgroundForm}
          onSubmit={(e) => e.preventDefault()}
        >
          {mockPlaygroundInputs.map((field) => (
            <label key={field.name} className={styles.formRow}>
              <span className={styles.formLabel}>{field.label}</span>
              {field.type === 'select' ? (
                <select
                  className={styles.formInput}
                  value={String(values[field.name])}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                >
                  {field.options!.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  className={styles.formInput}
                  value={values[field.name] as string | number}
                  onChange={(e) => handleChange(
                    field.name,
                    field.type === 'number' ? Number(e.target.value) : e.target.value,
                  )}
                />
              )}
            </label>
          ))}
          <button type="submit" className={styles.predictBtn}>
            <Play className={styles.predictBtnIcon} aria-hidden="true" />
            Predict
          </button>
        </form>
      </div>

      {/* Right: static response */}
      <div className={styles.playgroundCard}>
        <div className={styles.cardHeader}>
          <span className={styles.cardEyebrow}>RESPONSE</span>
          <span className={styles.cardHeaderHint}>
            {mockPlaygroundResponse.latency_ms}ms · {mockPlaygroundResponse.model_version}
          </span>
        </div>

        <div className={styles.predictionHero}>
          <div className={styles.predictionLabel}>Prediction</div>
          <div className={styles.predictionValue}>{mockPlaygroundResponse.prediction}</div>
          <div className={styles.probabilityBarWrap}>
            <div
              className={styles.probabilityBar}
              style={{ width: `${mockPlaygroundResponse.churn_probability * 100}%` }}
              aria-hidden="true"
            />
          </div>
          <div className={styles.predictionSub}>
            p(churn) = {mockPlaygroundResponse.churn_probability.toFixed(4)} · confidence {Math.round(mockPlaygroundResponse.confidence * 100)}%
          </div>
        </div>

        <div className={styles.shapList}>
          <div className={styles.shapHeader}>Top features</div>
          {mockPlaygroundResponse.top_features.map((f) => {
            const positive = f.contribution >= 0;
            const pct = Math.min(100, Math.abs(f.contribution) * 180);
            return (
              <div key={f.name} className={styles.shapRow}>
                <span className={styles.shapName}>{f.name}</span>
                <div className={styles.shapBarTrack}>
                  <div
                    className={cn(styles.shapBar, positive ? styles.shapBarPos : styles.shapBarNeg)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={cn(styles.shapValue, positive ? styles.shapValuePos : styles.shapValueNeg)}>
                  {positive ? '+' : ''}{f.contribution.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  API                                                            */
/* ────────────────────────────────────────────────────────────── */

function ApiPanel() {
  return (
    <div className={styles.api}>
      <div className={styles.apiEndpointHeader}>
        <span className={styles.methodBadge}>POST</span>
        <code className={styles.apiPath}>/v1/novacraft-churn/predict</code>
      </div>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>curl</h3>
        <pre className={styles.codeBlock}>{mockCurlSnippet}</pre>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Request body</h3>
        <div className={styles.schemaTable}>
          {mockRequestSchema.map((f) => (
            <div key={f.name} className={styles.schemaRow}>
              <code className={styles.schemaName}>{f.name}</code>
              <span className={styles.schemaType}>{f.type}</span>
              <span className={cn(styles.schemaBadge, f.required && styles.schemaBadgeRequired)}>
                {f.required ? 'required' : 'optional'}
              </span>
              <span className={styles.schemaDesc}>{f.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Response</h3>
        <div className={styles.schemaTable}>
          {mockResponseSchema.map((f) => (
            <div key={f.name} className={styles.schemaRow}>
              <code className={styles.schemaName}>{f.name}</code>
              <span className={styles.schemaType}>{f.type}</span>
              <span className={styles.schemaBadge}>returned</span>
              <span className={styles.schemaDesc}>{f.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Logs                                                           */
/* ────────────────────────────────────────────────────────────── */

function LogsPanel() {
  return (
    <div className={styles.logsBlock} role="log" aria-label="Deployment logs">
      {mockLogs.map((log) => (
        <div key={log.requestId + log.timestamp} className={styles.logRow}>
          <span className={styles.logTime}>{log.timestamp}</span>
          <span className={cn(styles.logLevel, styles[`logLevel${log.level}`])}>
            {log.level.padEnd(5, ' ')}
          </span>
          <span className={styles.logReq}>{log.requestId}</span>
          <span className={styles.logMsg}>{log.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Monitoring                                                     */
/* ────────────────────────────────────────────────────────────── */

const LATENCY_LINES = [
  { dataKey: 'p50', color: '#F7F8F8', name: 'p50' },
  { dataKey: 'p95', color: '#8A8F98', name: 'p95' },
] as const;
const RPS_LINES   = [{ dataKey: 'rps',  color: '#F7F8F8', name: 'rps' }] as const;
const ERROR_LINES = [{ dataKey: 'rate', color: '#F7F8F8', name: 'rate' }] as const;

interface LineSpec { dataKey: string; color: string; name: string }
interface MiniLineChartProps<T extends { t: string }> {
  title: string;
  subtitle: string;
  data: ReadonlyArray<T>;
  lines: ReadonlyArray<LineSpec>;
  yFormatter?: (v: number) => string;
}

function MiniLineChart<T extends { t: string }>({ title, subtitle, data, lines, yFormatter }: MiniLineChartProps<T>) {
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <h4 className={styles.chartCardTitle}>{title}</h4>
        <span className={styles.chartCardSubtitle}>{subtitle}</span>
      </div>
      <div className={styles.chartBody}>
        <ResponsiveContainer>
          <LineChart data={data as T[]} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="t"
              tick={CHART_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              interval={11}
            />
            <YAxis
              tick={CHART_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={yFormatter}
            />
            {lines.map((l) => (
              <Line
                key={l.dataKey}
                type="monotone"
                dataKey={l.dataKey}
                name={l.name}
                stroke={l.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            <RTooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MonitoringPanel() {
  return (
    <div className={styles.chartsGrid}>
      <MiniLineChart
        title="Latency"
        subtitle="p50 / p95 · last 60 min"
        data={mockLatencyHistory}
        lines={LATENCY_LINES}
        yFormatter={(v) => `${v}ms`}
      />
      <MiniLineChart
        title="Requests / sec"
        subtitle="rolling rps · last 60 min"
        data={mockRpsHistory}
        lines={RPS_LINES}
      />
      <MiniLineChart
        title="Error rate"
        subtitle="5xx + 4xx ratio · last 60 min"
        data={mockErrorHistory}
        lines={ERROR_LINES}
        yFormatter={(v) => `${(v * 100).toFixed(2)}%`}
      />
    </div>
  );
}

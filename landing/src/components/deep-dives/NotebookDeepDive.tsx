import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Streamdown } from 'streamdown';

import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import styles from './NotebookDeepDive.module.css';

// Static 8-line Python cell using real NovaCraft columns. Rendered through
// Streamdown as a fenced markdown code block for syntax highlighting (the
// spec explicitly calls out streamdown, NOT Monaco).
const CODE_MARKDOWN = `\`\`\`python
import pandas as pd

df = pd.read_csv('customers.csv')

# Quick descriptive stats on the key engagement signals
summary = df[['mrr_usd', 'avg_session_minutes', 'api_calls']].describe()
summary
\`\`\``;

// Pre-seeded describe() summary rendered as a simple inline <table>. We used
// to pipe this through the real frontend `NotebookCellOutput`, but that
// transitively static-imports `PlotlyOutput` (react-plotly, ~4.9 MB) and
// `ShadowHtml` (mermaid, ~490 KB) via `CellOutputRenderer`. The deep-dive
// only ever shows this one 6-row table so we render it directly and keep
// those chunks out of the landing bundle.
const DESCRIBE_COLUMNS = [
  'stat',
  'mrr_usd',
  'avg_session_minutes',
  'api_calls',
] as const;

type DescribeColumn = (typeof DESCRIBE_COLUMNS)[number];

const DESCRIBE_ROWS: ReadonlyArray<Readonly<Record<DescribeColumn, string>>> = [
  { stat: 'count', mrr_usd: '2,530',  avg_session_minutes: '2,280', api_calls: '2,530'   },
  { stat: 'mean',  mrr_usd: '2,142',  avg_session_minutes: '18.4',  api_calls: '12,004'  },
  { stat: 'std',   mrr_usd: '1,854',  avg_session_minutes: '12.7',  api_calls: '28,312'  },
  { stat: 'min',   mrr_usd: '0',      avg_session_minutes: '0.3',   api_calls: '0'       },
  { stat: '50%',   mrr_usd: '1,620',  avg_session_minutes: '15.2',  api_calls: '3,412'   },
  { stat: 'max',   mrr_usd: '24,180', avg_session_minutes: '84.1',  api_calls: '892,448' },
];

// Hand-binned mrr_usd histogram (right-skewed: long tail of high-value
// accounts). Rendered with Recharts per section 4.5 of the spec.
const HISTOGRAM = [
  { bucket: '$0–500',   count: 280 },
  { bucket: '$500–1k',  count: 540 },
  { bucket: '$1k–2k',   count: 720 },
  { bucket: '$2k–5k',   count: 610 },
  { bucket: '$5k–10k',  count: 240 },
  { bucket: '$10k–25k', count: 110 },
  { bucket: '$25k+',    count:  30 },
];

type Phase = 'idle' | 'running' | 'done';

function NotebookDeepDiveVisual() {
  // Reactive hook — also seeds the initial phase so we never call setState
  // synchronously inside the effect below.
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(() => (reduced ? 'done' : 'idle'));

  useEffect(() => {
    if (reduced) {
      return;
    }

    // IO-enter → 600ms idle, 1.2s running indicator, then output reveal.
    const startTimer = window.setTimeout(() => setPhase('running'), 600);
    const doneTimer  = window.setTimeout(() => setPhase('done'),    1800);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(doneTimer);
    };
  }, [reduced]);

  return (
    <div className={styles.root}>
      {/* Top cell — code + running indicator + inline output once done. */}
      <div className={`${styles.cell} group`}>
        <div className={styles.cellHeader}>
          <span>In [1]</span>
          <span className={styles.cellHeaderBadge}>python</span>
        </div>
        <div className={styles.cellCode}>
          <Streamdown parseIncompleteMarkdown={false}>
            {CODE_MARKDOWN}
          </Streamdown>
        </div>

        {phase === 'running' && (
          <div className={styles.cellRunning} aria-live="polite">
            <span className={styles.runningDot} aria-hidden="true" />
            Running cell…
          </div>
        )}

        {phase === 'done' && (
          <div className={styles.outputHost}>
            <table className={styles.describeTable}>
              <thead>
                <tr>
                  {DESCRIBE_COLUMNS.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DESCRIBE_ROWS.map((row) => (
                  <tr key={row.stat}>
                    {DESCRIBE_COLUMNS.map((col) => (
                      <td key={col}>{row[col]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom cell — Recharts histogram of mrr_usd (right-skewed). */}
      {phase === 'done' && (
        <div className={styles.cell}>
          <div className={styles.cellHeader}>
            <span>Out [1]</span>
            <span className={styles.cellHeaderBadge}>chart</span>
          </div>
          <div className={styles.outputCell}>
            <p className={styles.chartLabel}>mrr_usd distribution</p>
            <div className={styles.chartBlock}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={HISTOGRAM}
                  margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
                >
                  <XAxis
                    dataKey="bucket"
                    tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{
                      background: 'var(--surface-2)',
                      border: '0.8px solid var(--border)',
                      borderRadius: 6,
                      fontFamily: 'Geist Mono Variable, monospace',
                      fontSize: 11,
                      color: 'var(--text)',
                    }}
                    labelStyle={{ color: 'var(--text-dim)' }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#F7F8F8"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Deep-dive 3 — NOTEBOOK visual. A minimal two-cell notebook preview. The
 * shared `<DeepDive>` chrome (eyebrow, headline, body, kbd hint) is composed
 * around this by `FeaturesSection.astro` — this component renders only the
 * left-hand visual content.
 *
 * The top cell is a static 8-line Python snippet highlighted via `streamdown`
 * (not Monaco), followed by a 1.2s "running" blink on IO-enter and then a
 * pre-seeded `describe()` summary rendered as a plain inline `<table>`. The
 * table used to go through the real frontend `NotebookCellOutput`, but that
 * statically pulls in Plotly + Mermaid via `CellOutputRenderer` — so we
 * inline it here and save ~5 MB of JS from the landing bundle. The bottom
 * cell is a Recharts `<BarChart>` showing a hand-binned, right-skewed
 * `mrr_usd` distribution.
 */
export default function NotebookDeepDive() {
  return <NotebookDeepDiveVisual />;
}

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
import { TooltipProvider } from '@frontend/components/ui/tooltip';
import { NotebookCellOutput } from '@frontend/components/notebook/NotebookCellOutput';
import type { RichOutput } from '@frontend/lib/api/execution';

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

// Pre-seeded describe() summary, shaped as a NotebookCellOutput "table" row
// so the real frontend renderer (CellOutputRenderer) parses it through
// parseTableData({ columns, rows }) and displays it identically to a live
// execution result.
const DESCRIBE_TABLE: RichOutput = {
  type: 'table',
  content: 'describe() summary',
  data: {
    columns: ['stat', 'mrr_usd', 'avg_session_minutes', 'api_calls'],
    rows: [
      { stat: 'count', mrr_usd: '2,530',  avg_session_minutes: '2,280', api_calls: '2,530'   },
      { stat: 'mean',  mrr_usd: '2,142',  avg_session_minutes: '18.4',  api_calls: '12,004'  },
      { stat: 'std',   mrr_usd: '1,854',  avg_session_minutes: '12.7',  api_calls: '28,312'  },
      { stat: 'min',   mrr_usd: '0',      avg_session_minutes: '0.3',   api_calls: '0'       },
      { stat: '50%',   mrr_usd: '1,620',  avg_session_minutes: '15.2',  api_calls: '3,412'   },
      { stat: 'max',   mrr_usd: '24,180', avg_session_minutes: '84.1',  api_calls: '892,448' },
    ],
  },
};

const DESCRIBE_OUTPUTS: RichOutput[] = [DESCRIBE_TABLE];

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
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setPhase('done');
      return;
    }

    // IO-enter → 600ms idle, 1.2s running indicator, then output reveal.
    const startTimer = window.setTimeout(() => setPhase('running'), 600);
    const doneTimer  = window.setTimeout(() => setPhase('done'),    1800);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
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
              <NotebookCellOutput outputs={DESCRIBE_OUTPUTS} />
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
    </TooltipProvider>
  );
}

/**
 * Deep-dive 3 — NOTEBOOK visual. A minimal two-cell notebook preview. The
 * shared `<DeepDive>` chrome (eyebrow, headline, body, kbd hint) is composed
 * around this by `FeaturesSection.astro` — this component renders only the
 * left-hand visual content.
 *
 * The top cell is a static 8-line Python snippet highlighted via `streamdown`
 * (not Monaco), followed by a 1.2s "running" blink on IO-enter and then the
 * real frontend {@link NotebookCellOutput} rendering a pre-seeded
 * `RichOutput[]` with the `describe()` summary as a parsed table. The bottom
 * cell is a Recharts `<BarChart>` showing a hand-binned, right-skewed
 * `mrr_usd` distribution.
 */
export default function NotebookDeepDive() {
  return <NotebookDeepDiveVisual />;
}

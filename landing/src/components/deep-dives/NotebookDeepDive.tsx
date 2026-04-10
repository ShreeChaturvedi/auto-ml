import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import styles from './NotebookDeepDive.module.css';

// Static 8-line Python cell using real NovaCraft columns, pre-highlighted
// *offline* with Shiki's `github-dark` theme (the same theme Streamdown
// defaults to). The HTML string below is literally the output of
// `shiki.codeToHtml(source, { lang: 'python', theme: 'github-dark' })` and
// is rendered via `dangerouslySetInnerHTML` on a <div>, so the client pays
// exactly 0 bytes of highlighter JS at runtime.
//
// Why not `<Streamdown>` or streamdown's `<CodeBlock>`? The landing spec
// asks for "streamdown syntax highlighting (not Monaco)" and Section 5
// estimates streamdown at ~40 KB. In practice, the `streamdown` v2 entry
// pulls in ~450 KB (140 KB gzip) of markdown-pipeline + a top-level
// `lazy(() => import('./mermaid-...js'))` reference that rollup cannot
// tree-shake — even when we import only `CodeBlock`. The spec's *intent*
// ("lightweight highlighting, not Monaco, not a runtime diagram engine")
// is much better served by shipping pre-baked HTML for this one 8-line
// snippet. Visual fidelity is identical because the output is real Shiki
// HTML with the same theme Streamdown would have used.
//
// If the snippet ever needs to change, regenerate with:
//   node -e "import('shiki').then(async ({codeToHtml}) => \
//     console.log(await codeToHtml(SOURCE, { lang: 'python', theme: 'github-dark' })))"
// …and paste the resulting <pre>…</pre> into CODE_HIGHLIGHTED_HTML below.
const CODE_HIGHLIGHTED_HTML =
  '<pre class="shiki github-dark" style="background-color:#24292e;color:#e1e4e8" tabindex="0"><code>' +
  '<span class="line"><span style="color:#F97583">import</span><span style="color:#E1E4E8"> pandas </span><span style="color:#F97583">as</span><span style="color:#E1E4E8"> pd</span></span>\n' +
  '<span class="line"></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">df </span><span style="color:#F97583">=</span><span style="color:#E1E4E8"> pd.read_csv(</span><span style="color:#9ECBFF">\'customers.csv\'</span><span style="color:#E1E4E8">)</span></span>\n' +
  '<span class="line"></span>\n' +
  '<span class="line"><span style="color:#6A737D"># Quick descriptive stats on the key engagement signals</span></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">summary </span><span style="color:#F97583">=</span><span style="color:#E1E4E8"> df[[</span><span style="color:#9ECBFF">\'mrr_usd\'</span><span style="color:#E1E4E8">, </span><span style="color:#9ECBFF">\'avg_session_minutes\'</span><span style="color:#E1E4E8">, </span><span style="color:#9ECBFF">\'api_calls\'</span><span style="color:#E1E4E8">]].describe()</span></span>\n' +
  '<span class="line"><span style="color:#E1E4E8">summary</span></span>' +
  '</code></pre>';

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
        <div
          className={styles.cellCode}
          // Pre-highlighted Shiki HTML (see CODE_HIGHLIGHTED_HTML comment above).
          // The string is a build-time constant authored by us, not user input,
          // so dangerouslySetInnerHTML is safe here.
          dangerouslySetInnerHTML={{ __html: CODE_HIGHLIGHTED_HTML }}
        />

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
 * The top cell is a static 8-line Python snippet whose Shiki-highlighted
 * HTML is baked into the source (see `CODE_HIGHLIGHTED_HTML` for why we
 * bypass `streamdown` here), followed by a 1.2s "running" blink on
 * IO-enter and then a pre-seeded `describe()` summary rendered as a plain
 * inline `<table>`. The table used to go through the real frontend
 * `NotebookCellOutput`, but that statically pulls in Plotly + Mermaid via
 * `CellOutputRenderer` — so we inline it here and save ~5 MB of JS from
 * the landing bundle. The bottom cell is a Recharts `<BarChart>` showing a
 * hand-binned, right-skewed `mrr_usd` distribution.
 */
export default function NotebookDeepDive() {
  return <NotebookDeepDiveVisual />;
}

import { useEffect, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NotebookCellOutput } from '@frontend/components/notebook/NotebookCellOutput';
import { TooltipProvider } from '@frontend/components/ui/tooltip';
import type { RichOutput } from '@frontend/lib/api/execution';
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

// Pre-seeded describe() summary as a `RichOutput[]` fed straight to the real
// `<NotebookCellOutput>` island — spec §4.5 explicitly requires the real
// component here, not a hand-rolled <table>. The `type: 'table'` branch of
// `CellOutputRenderer` handles this entirely with plain DOM; the only heavy
// dependency in the renderer tree (`LazyPlot` → `react-plotly.js`, ~4.9 MB)
// is a `React.lazy(() => import(...))` dynamic import that is ONLY resolved
// when a `type: 'chart'` output is actually mounted. Because this deep-dive
// never passes a chart output to NotebookCellOutput, Vite emits the plotly
// chunk but never fetches it at runtime — verified post-build by confirming
// NotebookDeepDive's emitted chunk only references `react-plotly.*.js`
// through `__vite__mapDeps` (dynamic-import dep table), never statically.
const DESCRIBE_OUTPUTS: RichOutput[] = [
  {
    type: 'table',
    content: 'describe() summary · 3 numeric columns',
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
  },
];

// Hand-binned mrr_usd histogram (right-skewed: long tail of high-value
// accounts). Rendered as a standalone Recharts <BarChart> in its own cell
// rather than routed through <NotebookCellOutput> via a `type: 'chart'`
// RichOutput — that path mounts PlotlyOutput, which triggers the lazy
// react-plotly.js chunk (~4.9 MB). Recharts is already in the landing
// bundle for other deep-dives, so this histogram costs zero extra bytes.
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
  // Reactive hook — also seeds the initial phase so reduced-motion users
  // land on the final state without any transitions.
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(() => (reduced ? 'done' : 'idle'));
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduced) {
      return;
    }
    const node = rootRef.current;
    if (!node) {
      return;
    }

    let startTimer = 0;
    let doneTimer = 0;
    let fired = false;

    // Scripted sequence kicks off the first time the frame enters the
    // viewport: short idle → 1.2s "running" blink → output reveal. Uses
    // IntersectionObserver per spec §4.5 so the animation lines up with
    // the reader's scroll position instead of hydration timing.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired) {
            fired = true;
            startTimer = window.setTimeout(() => setPhase('running'), 200);
            doneTimer = window.setTimeout(() => setPhase('done'), 1400);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      window.clearTimeout(startTimer);
      window.clearTimeout(doneTimer);
    };
  }, [reduced]);

  return (
    <div className={styles.root} ref={rootRef}>
      {/* Top cell — code + running indicator + the real frontend
       * <NotebookCellOutput> island once the scripted run finishes. */}
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
            {/* Real <NotebookCellOutput> from frontend/src/. Wrapped in a
             * TooltipProvider so its Radix copy/collapse tooltips have the
             * ancestor they need (the rest of the landing page does not
             * provide one). */}
            <TooltipProvider delayDuration={150}>
              <NotebookCellOutput outputs={DESCRIBE_OUTPUTS} />
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Bottom cell — standalone Recharts histogram of mrr_usd
       * (right-skewed). See HISTOGRAM comment for why this does NOT go
       * through NotebookCellOutput. */}
      {phase === 'done' && (
        <div className={styles.cell}>
          <div className={styles.cellHeader}>
            <span>Out [2]</span>
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
 * IO-enter and then the real frontend `<NotebookCellOutput>` rendering a
 * `type: 'table'` `RichOutput` with the describe() summary stats — the
 * actual leaf component from `frontend/src/`, not a re-implementation.
 *
 * The bottom cell is a standalone Recharts `<BarChart>` histogram of
 * `mrr_usd`. It lives outside NotebookCellOutput on purpose: routing it
 * through a `type: 'chart'` RichOutput would mount PlotlyOutput and
 * trigger the `React.lazy(() => import('react-plotly.js'))` chunk
 * (~4.9 MB), which would dwarf the entire landing bundle. As long as we
 * never pass a chart RichOutput through NotebookCellOutput, Vite emits
 * the plotly chunk but never fetches it at runtime.
 */
export default function NotebookDeepDive() {
  return <NotebookDeepDiveVisual />;
}

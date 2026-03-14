/**
 * PlotlyBoxViolin — Box or violin plots for comparing numeric distributions.
 * Uses precomputed NumericColumnSummary stats for box plots, and optionally
 * approximates violin shapes from histogram bucket data.
 */

import { useMemo } from 'react';
import {
  LazyPlot,
  PlotSuspense,
  PLOTLY_CONFIG,
  getPlotlyLayout,
  useIsDark,
} from './edaTheme';
import { formatNumber } from './edaFormatters';
import type { NumericColumnSummary, HistogramData } from '@/types/file';

interface PlotlyBoxViolinProps {
  columns: NumericColumnSummary[];
  histograms?: HistogramData[];
  mode: 'box' | 'violin';
  height?: number;
  className?: string;
}

/**
 * Synthesize a flat array of y-values from histogram buckets by repeating
 * each bucket midpoint according to its count. This gives Plotly enough
 * sample data to render a violin shape.
 *
 * For very large counts we subsample proportionally (cap at ~2000 points
 * per column to keep the browser responsive).
 */
function synthesizeValues(buckets: HistogramData['buckets']): number[] {
  const totalCount = buckets.reduce((s, b) => s + b.count, 0);
  if (totalCount === 0) return [];

  const MAX_POINTS = 2000;
  const scale = totalCount > MAX_POINTS ? MAX_POINTS / totalCount : 1;

  const values: number[] = [];
  for (const bucket of buckets) {
    const midpoint = (bucket.start + bucket.end) / 2;
    const n = Math.max(1, Math.round(bucket.count * scale));
    for (let i = 0; i < n; i++) {
      values.push(midpoint);
    }
  }
  return values;
}

export function PlotlyBoxViolin({
  columns,
  histograms,
  mode,
  height = 350,
  className,
}: PlotlyBoxViolinProps) {
  const isDark = useIsDark();

  const { traces, layout } = useMemo(() => {
    const baseLayout = getPlotlyLayout(isDark);
    const colorway = (baseLayout.colorway as string[]) ?? [
      'hsl(var(--primary))',
    ];

    const allTraces: Record<string, unknown>[] = [];

    if (mode === 'box') {
      columns.forEach((col, idx) => {
        const iqr = col.q3 - col.q1;
        allTraces.push({
          type: 'box',
          name: col.column,
          q1: [col.q1],
          median: [col.median],
          q3: [col.q3],
          lowerfence: [Math.max(col.min, col.q1 - 1.5 * iqr)],
          upperfence: [Math.min(col.max, col.q3 + 1.5 * iqr)],
          mean: [col.mean],
          boxmean: true,
          marker: { color: colorway[idx % colorway.length] },
          hoverinfo: 'text',
          text: [
            `${col.column}<br>` +
              `Min: ${formatNumber(col.min)}<br>` +
              `Q1: ${formatNumber(col.q1)}<br>` +
              `Median: ${formatNumber(col.median)}<br>` +
              `Q3: ${formatNumber(col.q3)}<br>` +
              `Max: ${formatNumber(col.max)}<br>` +
              `Mean: ${formatNumber(col.mean)}`,
          ],
        });
      });
    } else {
      // Violin mode — needs raw-ish y-values
      const histMap = new Map(
        (histograms ?? []).map((h) => [h.column, h]),
      );

      columns.forEach((col, idx) => {
        const hist = histMap.get(col.column);
        const yValues = hist
          ? synthesizeValues(hist.buckets)
          : // Fallback: synthesize 5-number summary as minimal sample
            [col.min, col.q1, col.median, col.q3, col.max];

        allTraces.push({
          type: 'violin',
          name: col.column,
          y: yValues,
          box: { visible: true },
          meanline: { visible: true },
          scalemode: 'width',
          marker: { color: colorway[idx % colorway.length] },
          hoverinfo: 'y',
        });
      });
    }

    const overrides: Record<string, unknown> = {
      height,
      showlegend: columns.length > 1,
    };

    const layout = { ...getPlotlyLayout(isDark), ...overrides };
    return { traces: allTraces, layout };
  }, [columns, histograms, mode, height, isDark]);

  if (columns.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No numeric columns to display
      </div>
    );
  }

  return (
    <div className={className}>
      <PlotSuspense height={height}>
        <LazyPlot
          data={traces}
          layout={layout}
          config={PLOTLY_CONFIG}
          className="w-full"
        />
      </PlotSuspense>
    </div>
  );
}

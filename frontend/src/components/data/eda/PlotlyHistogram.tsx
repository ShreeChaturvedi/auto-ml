/**
 * PlotlyHistogram — Plotly-based histogram with optional KDE overlay
 * and mean/median reference lines from numeric summary stats.
 */

import { useMemo } from 'react';
import {
  LazyPlot,
  PlotSuspense,
  PLOTLY_CONFIG,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
} from './edaTheme';
import { formatAxis } from './edaFormatters';
import { computeKDE } from './edaDataUtils';
import type { HistogramData, NumericColumnSummary } from '@/types/file';

interface PlotlyHistogramProps {
  histogram: HistogramData;
  numericSummary?: NumericColumnSummary;
  showKDE?: boolean;
  height?: number;
  className?: string;
}

/** Build a vertical reference-line shape for the histogram overlay. */
function makeReferenceLine(
  x: number, color: string, dash: string, opacity = 1
): Record<string, unknown> {
  return {
    type: 'line', x0: x, x1: x, y0: 0, y1: 1, yref: 'paper',
    line: { color, width: 1.5, dash },
    opacity,
  };
}

/** Build a reference-line annotation positioned on the paper y-axis. */
function makeReferenceAnnotation(
  x: number, y: number, text: string, color: string
): Record<string, unknown> {
  return {
    x, y, yref: 'paper', text, showarrow: false,
    font: { size: 10, color }, yanchor: 'bottom',
  };
}

export function PlotlyHistogram({
  histogram,
  numericSummary,
  showKDE = true,
  height = 300,
  className,
}: PlotlyHistogramProps) {
  const isDark = useIsDark();

  // --- 1. Bar trace ---
  const barTrace = useMemo(() => {
    const buckets = histogram.buckets;
    const midpoints = buckets.map((b) => (b.start + b.end) / 2);
    const counts = buckets.map((b) => b.count);
    const edaColors = getEdaColors(isDark);

    return {
      type: 'bar' as const,
      x: midpoints,
      y: counts,
      name: 'Count',
      marker: {
        color: edaColors[0],
        opacity: 0.7,
        line: { color: edaColors[0], width: 1 },
      },
      hovertemplate: midpoints.map(
        (_mp, i) =>
          `${formatAxis(buckets[i].start)} \u2013 ${formatAxis(buckets[i].end)}<br>Count: ${counts[i].toLocaleString()}<extra></extra>`,
      ),
    } as Record<string, unknown>;
  }, [histogram, isDark]);

  // --- 2. KDE trace (optional) ---
  const kdeTrace = useMemo(() => {
    if (!showKDE) return null;

    const buckets = histogram.buckets;
    const midpoints = buckets.map((b) => (b.start + b.end) / 2);
    const counts = buckets.map((b) => b.count);
    const totalCount = counts.reduce((s, c) => s + c, 0);
    const edaColors = getEdaColors(isDark);

    if (totalCount <= 0) return null;

    // Silverman bandwidth: h = 1.06 * sigma * n^(-1/5)
    const weightedSum = midpoints.reduce((s, mp, i) => s + mp * counts[i], 0);
    const mean = weightedSum / totalCount;
    const variance =
      midpoints.reduce((s, mp, i) => s + counts[i] * (mp - mean) ** 2, 0) /
      totalCount;
    const stdDev = Math.sqrt(variance);
    const h = 1.06 * stdDev * Math.pow(totalCount, -0.2);

    if (h <= 0) return null;

    const kde = computeKDE(buckets, h);
    return {
      type: 'scatter',
      mode: 'lines',
      x: kde.x,
      y: kde.y,
      name: 'Density',
      yaxis: 'y2',
      line: { color: edaColors[1], width: 2, shape: 'spline' },
      hoverinfo: 'skip',
    } as Record<string, unknown>;
  }, [histogram, showKDE, isDark]);

  // --- 3. Reference shapes + annotations from numericSummary ---
  const { shapes, annotations } = useMemo(() => {
    const shapes: Record<string, unknown>[] = [];
    const annotations: Record<string, unknown>[] = [];

    if (!numericSummary) return { shapes, annotations };

    const buckets = histogram.buckets;
    const xMin = buckets[0].start;
    const xMax = buckets[buckets.length - 1].end;
    const edaColors = getEdaColors(isDark);

    // Std deviation reference lines at mean +/- stdDev
    if (numericSummary.stdDev > 0) {
      const meanMinusStd = numericSummary.mean - numericSummary.stdDev;
      const meanPlusStd = numericSummary.mean + numericSummary.stdDev;

      if (meanMinusStd >= xMin && meanMinusStd <= xMax) {
        shapes.push(makeReferenceLine(meanMinusStd, edaColors[2], 'dash', 0.5));
      }
      if (meanPlusStd >= xMin && meanPlusStd <= xMax) {
        shapes.push(makeReferenceLine(meanPlusStd, edaColors[2], 'dash', 0.5));
      }
    }

    if (numericSummary.mean >= xMin && numericSummary.mean <= xMax) {
      shapes.push(makeReferenceLine(numericSummary.mean, edaColors[3], 'dash'));
      annotations.push(
        makeReferenceAnnotation(numericSummary.mean, 1, `Mean: ${formatAxis(numericSummary.mean)}`, edaColors[3]),
      );
    }

    if (numericSummary.median >= xMin && numericSummary.median <= xMax) {
      shapes.push(makeReferenceLine(numericSummary.median, edaColors[4], 'dot'));
      annotations.push(
        makeReferenceAnnotation(numericSummary.median, 0.93, `Median: ${formatAxis(numericSummary.median)}`, edaColors[4]),
      );
    }

    return { shapes, annotations };
  }, [histogram, numericSummary, isDark]);

  // --- 4. Layout ---
  const layout = useMemo(() => {
    const overrides: Record<string, unknown> = {
      yaxis: { title: 'Count' },
      shapes,
      annotations,
      showlegend: false,
      height,
    };

    // Only add secondary y-axis when KDE is present
    if (kdeTrace) {
      overrides.yaxis2 = {
        overlaying: 'y',
        side: 'right',
        showgrid: false,
        title: 'Density',
      };
    }

    return { ...getPlotlyLayout(isDark), ...overrides };
  }, [shapes, annotations, height, kdeTrace, isDark]);

  // --- 5. Assemble traces ---
  const traces = [barTrace, kdeTrace].filter(Boolean) as Record<string, unknown>[];

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

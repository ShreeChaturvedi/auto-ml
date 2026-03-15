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
import type { HistogramData, NumericColumnSummary } from '@/types/file';

interface PlotlyHistogramProps {
  histogram: HistogramData;
  numericSummary?: NumericColumnSummary;
  showKDE?: boolean;
  height?: number;
  className?: string;
}

/**
 * Compute a Gaussian KDE (kernel density estimate) from histogram buckets.
 * Uses Silverman's rule of thumb for bandwidth selection.
 */
function computeKDE(
  buckets: HistogramData['buckets'],
  bandwidth: number,
): { x: number[]; y: number[] } {
  const midpoints = buckets.map((b) => (b.start + b.end) / 2);
  const counts = buckets.map((b) => b.count);
  const totalCount = counts.reduce((s, c) => s + c, 0);

  if (totalCount === 0 || bandwidth <= 0) {
    return { x: [], y: [] };
  }

  const xMin = buckets[0].start;
  const xMax = buckets[buckets.length - 1].end;
  const nPoints = 100;
  const step = (xMax - xMin) / (nPoints - 1);

  const xRange: number[] = [];
  for (let i = 0; i < nPoints; i++) {
    xRange.push(xMin + i * step);
  }

  // Gaussian kernel: K(u) = (1 / sqrt(2pi)) * exp(-0.5 * u^2)
  const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

  const yRange = xRange.map((x) => {
    let density = 0;
    for (let j = 0; j < midpoints.length; j++) {
      // Each bucket midpoint is weighted by its count
      const u = (x - midpoints[j]) / bandwidth;
      density += counts[j] * INV_SQRT_2PI * Math.exp(-0.5 * u * u);
    }
    return density / (totalCount * bandwidth);
  });

  return { x: xRange, y: yRange };
}

export function PlotlyHistogram({
  histogram,
  numericSummary,
  showKDE = true,
  height = 300,
  className,
}: PlotlyHistogramProps) {
  const isDark = useIsDark();

  const { traces, layout } = useMemo(() => {
    const buckets = histogram.buckets;
    const midpoints = buckets.map((b) => (b.start + b.end) / 2);
    const counts = buckets.map((b) => b.count);
    const totalCount = counts.reduce((s, c) => s + c, 0);
    const edaColors = getEdaColors(isDark);

    // 1. Bar trace
    const barTrace: Record<string, unknown> = {
      type: 'bar',
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
    };

    const allTraces: Record<string, unknown>[] = [barTrace];

    // 2. KDE trace (optional)
    if (showKDE && totalCount > 0) {
      // Silverman bandwidth: h = 1.06 * sigma * n^(-1/5)
      const weightedSum = midpoints.reduce((s, mp, i) => s + mp * counts[i], 0);
      const mean = weightedSum / totalCount;
      const variance =
        midpoints.reduce((s, mp, i) => s + counts[i] * (mp - mean) ** 2, 0) /
        totalCount;
      const stdDev = Math.sqrt(variance);
      const h = 1.06 * stdDev * Math.pow(totalCount, -0.2);

      if (h > 0) {
        const kde = computeKDE(buckets, h);
        allTraces.push({
          type: 'scatter',
          mode: 'lines',
          x: kde.x,
          y: kde.y,
          name: 'Density',
          yaxis: 'y2',
          line: { color: edaColors[1], width: 2, shape: 'spline' },
          hoverinfo: 'skip',
        });
      }
    }

    // 3. Reference-line shapes (mean + median + stdDev from numericSummary)
    const shapes: Record<string, unknown>[] = [];
    const annotations: Record<string, unknown>[] = [];

    if (numericSummary) {
      const xMin = buckets[0].start;
      const xMax = buckets[buckets.length - 1].end;

      // Std deviation reference lines at mean +/- stdDev
      if (numericSummary.stdDev > 0) {
        const meanMinusStd = numericSummary.mean - numericSummary.stdDev;
        const meanPlusStd = numericSummary.mean + numericSummary.stdDev;

        if (meanMinusStd >= xMin && meanMinusStd <= xMax) {
          shapes.push({
            type: 'line',
            x0: meanMinusStd,
            x1: meanMinusStd,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: { color: edaColors[2], width: 1, dash: 'dash' },
            opacity: 0.5,
          });
        }
        if (meanPlusStd >= xMin && meanPlusStd <= xMax) {
          shapes.push({
            type: 'line',
            x0: meanPlusStd,
            x1: meanPlusStd,
            y0: 0,
            y1: 1,
            yref: 'paper',
            line: { color: edaColors[2], width: 1, dash: 'dash' },
            opacity: 0.5,
          });
        }
      }

      if (numericSummary.mean >= xMin && numericSummary.mean <= xMax) {
        shapes.push({
          type: 'line',
          x0: numericSummary.mean,
          x1: numericSummary.mean,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: edaColors[3], width: 1.5, dash: 'dash' },
        });
        annotations.push({
          x: numericSummary.mean,
          y: 1,
          yref: 'paper',
          text: `Mean: ${formatAxis(numericSummary.mean)}`,
          showarrow: false,
          font: { size: 10, color: edaColors[3] },
          yanchor: 'bottom',
        });
      }

      if (numericSummary.median >= xMin && numericSummary.median <= xMax) {
        shapes.push({
          type: 'line',
          x0: numericSummary.median,
          x1: numericSummary.median,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: edaColors[4], width: 1.5, dash: 'dot' },
        });
        annotations.push({
          x: numericSummary.median,
          y: 0.93,
          yref: 'paper',
          text: `Median: ${formatAxis(numericSummary.median)}`,
          showarrow: false,
          font: { size: 10, color: edaColors[4] },
          yanchor: 'bottom',
        });
      }
    }

    const overrides: Record<string, unknown> = {
      yaxis: { title: 'Count' },
      shapes,
      annotations,
      showlegend: false,
      height,
    };

    // Only add secondary y-axis when KDE is present
    if (showKDE && totalCount > 0) {
      overrides.yaxis2 = {
        overlaying: 'y',
        side: 'right',
        showgrid: false,
        title: 'Density',
      };
    }

    const layout = { ...getPlotlyLayout(isDark), ...overrides };
    return { traces: allTraces, layout };
  }, [histogram, numericSummary, showKDE, height, isDark]);

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

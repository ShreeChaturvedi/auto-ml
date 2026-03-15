import { useMemo } from 'react';
import type { ScatterData, ScatterPairData } from '@/types/file';
import {
  LazyPlot,
  PlotSuspense,
  PLOTLY_CONFIG,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
} from './edaTheme';
import { getCorrelationLabel, computeScatterFromRows } from './edaFormatters';

interface PlotlyScatterProps {
  /** ScatterPairData (with optional regression) OR legacy ScatterData */
  data?: ScatterPairData | ScatterData;
  /** Raw rows for client-side fallback when data is not provided */
  rows?: Record<string, unknown>[];
  /** Column names for client-side fallback */
  xColumn?: string;
  yColumn?: string;
  correlation?: number;
  height?: number;
  className?: string;
}

export function PlotlyScatter({
  data,
  rows,
  xColumn,
  yColumn,
  correlation,
  height = 300,
  className,
}: PlotlyScatterProps) {
  const isDark = useIsDark();

  // Resolve points: prefer data prop, fall back to computing from rows
  const resolved = useMemo(() => {
    if (data) {
      return {
        points: data.points,
        xCol: data.xColumn,
        yCol: data.yColumn,
        regressionLine: 'regressionLine' in data ? data.regressionLine : undefined,
      };
    }
    if (rows && xColumn && yColumn) {
      return {
        points: computeScatterFromRows(rows, xColumn, yColumn),
        xCol: xColumn,
        yCol: yColumn,
        regressionLine: undefined,
      };
    }
    return null;
  }, [data, rows, xColumn, yColumn]);

  const traces = useMemo(() => {
    if (!resolved) return [];

    const markerColor = getEdaColors(isDark)[0];
    const scatterTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: resolved.points.map((p) => p.x),
      y: resolved.points.map((p) => p.y),
      marker: {
        color: markerColor,
        opacity: 0.6,
        size: 6,
      },
      showlegend: false,
      hovertemplate: '%{x}<br>%{y}<extra></extra>',
    };

    const result: Record<string, unknown>[] = [scatterTrace];

    // Add regression line when available
    if (resolved.regressionLine) {
      const { slope, intercept } = resolved.regressionLine;
      let xMin = Infinity, xMax = -Infinity;
      for (const p of resolved.points) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
      }
      result.push({
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: [xMin, xMax],
        y: [slope * xMin + intercept, slope * xMax + intercept],
        line: { color: getEdaColors(isDark)[1], width: 2, dash: 'dash' },
        showlegend: false,
        hoverinfo: 'skip',
      });
    }

    return result;
  }, [resolved, isDark]);

  const layout = useMemo(() => {
    if (!resolved) return {};
    const base = getPlotlyLayout(isDark);
    const annotations: Record<string, unknown>[] = [];

    // Correlation annotation (top-right)
    if (correlation !== undefined) {
      annotations.push({
        text: `r = ${correlation.toFixed(2)} (${getCorrelationLabel(correlation)})`,
        xref: 'paper' as const,
        yref: 'paper' as const,
        x: 0.98,
        y: 0.98,
        showarrow: false,
        font: { size: 11, family: 'monospace' },
        bgcolor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
        borderpad: 4,
      });
    }

    // R-squared annotation (below the correlation annotation)
    if (resolved.regressionLine) {
      annotations.push({
        text: `R\u00B2 = ${resolved.regressionLine.r2.toFixed(2)}`,
        xref: 'paper' as const,
        yref: 'paper' as const,
        x: 0.98,
        y: correlation !== undefined ? 0.90 : 0.98,
        showarrow: false,
        font: { size: 11, family: 'monospace' },
        bgcolor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
        borderpad: 4,
      });
    }

    return {
      ...base,
      height,
      xaxis: {
        ...(base.xaxis as object),
        title: { text: resolved.xCol, standoff: 8 },
      },
      yaxis: {
        ...(base.yaxis as object),
        title: { text: resolved.yCol, standoff: 8 },
      },
      annotations,
    };
  }, [isDark, height, resolved, correlation]);

  if (!resolved || resolved.points.length === 0) {
    return (
      <div className={className}>
        <div
          className="flex items-center justify-center text-muted-foreground text-sm"
          style={{ height }}
        >
          No scatter data available.
        </div>
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

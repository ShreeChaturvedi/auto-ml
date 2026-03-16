/**
 * PlotlyMissingValueMatrix — horizontal bar chart showing missing % per column.
 * Replaces the previous binary heatmap which was useless for datasets with few missing values.
 */

import { useMemo } from 'react';
import type { Data } from 'plotly.js';
import { LazyPlot, PlotSuspense, PLOTLY_CONFIG, getPlotlyLayout, useIsDark } from './edaTheme';
import { truncateText } from './edaFormatters';

interface PlotlyMissingValueMatrixProps {
  missingMatrix: { columns: string[]; matrix: number[][] };
  className?: string;
}

/** Hardcoded severity color (CSS vars don't work in Plotly) */
function severityColor(completeness: number, isDark: boolean): string {
  if (completeness >= 100) return isDark ? 'hsl(155,70%,55%)' : 'hsl(155,65%,50%)';
  if (completeness >= 95)  return isDark ? 'hsl(170,50%,55%)' : 'hsl(170,45%,50%)';
  if (completeness >= 80)  return isDark ? 'hsl(38,75%,60%)'  : 'hsl(38,70%,55%)';
  return isDark ? 'hsl(0,70%,60%)' : 'hsl(0,65%,55%)';
}

export function PlotlyMissingValueMatrix({
  missingMatrix,
  className,
}: PlotlyMissingValueMatrixProps) {
  const isDark = useIsDark();
  const { columns, matrix } = missingMatrix;

  const barData = useMemo(() => {
    // Single pass over matrix — O(rows × cols) total, not O(cols × rows) per column
    const counts = new Array<number>(columns.length).fill(0);
    for (const row of matrix) {
      for (let ci = 0; ci < row.length; ci++) {
        if (row[ci] === 0) counts[ci]++;
      }
    }
    return columns
      .map((col, i) => ({ column: col, pct: (counts[i] / matrix.length) * 100 }))
      .filter(d => d.pct > 0)
      .sort((a, b) => a.pct - b.pct);
  }, [columns, matrix]);

  const height = Math.max(120, barData.length * 28 + 60);

  const trace = useMemo(
    () => ({
      type: 'bar' as const,
      orientation: 'h' as const,
      y: barData.map(d => truncateText(d.column, 20)),
      x: barData.map(d => d.pct),
      text: barData.map(d => `${d.pct.toFixed(1)}%`),
      textposition: 'auto' as const,
      marker: { color: barData.map(d => severityColor(100 - d.pct, isDark)) },
      hovertemplate: '%{y}: %{x:.1f}% missing<extra></extra>',
    }),
    [barData, isDark],
  );

  const layout = useMemo(() => {
    const base = getPlotlyLayout(isDark);
    return {
      ...base,
      height,
      margin: { l: 120, r: 16, t: 8, b: 36 },
      xaxis: {
        ...(base.xaxis as object),
        range: [0, 100],
        title: { text: 'Missing %', standoff: 8 },
      },
    };
  }, [isDark, height]);

  if (barData.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <PlotSuspense height={height} loadingLabel="Loading missing-value chart...">
        <LazyPlot
          data={[trace] as Data[]}
          layout={layout}
          config={PLOTLY_CONFIG}
          className="w-full"
        />
      </PlotSuspense>
    </div>
  );
}

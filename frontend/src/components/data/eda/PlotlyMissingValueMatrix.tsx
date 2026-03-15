/**
 * PlotlyMissingValueMatrix — binary heatmap showing missing (0) vs present (1)
 * values across columns and sampled rows.
 */

import { useMemo } from 'react';
import type { Data } from 'plotly.js';
import { LazyPlot, PlotSuspense, PLOTLY_CONFIG, getPlotlyLayout, useIsDark } from './edaTheme';
import { truncateText } from './edaFormatters';

interface PlotlyMissingValueMatrixProps {
  missingMatrix: { columns: string[]; matrix: number[][] };
  height?: number;
  className?: string;
}

export function PlotlyMissingValueMatrix({
  missingMatrix,
  height: heightOverride,
  className,
}: PlotlyMissingValueMatrixProps) {
  const isDark = useIsDark();
  const { columns, matrix } = missingMatrix;

  const height = heightOverride ?? Math.max(180, Math.min(350, matrix.length * 3));

  const truncatedColumns = useMemo(
    () => columns.map((c) => truncateText(c, 15)),
    [columns],
  );

  const rowIndices = useMemo(
    () => Array.from({ length: matrix.length }, (_, i) => i),
    [matrix],
  );

  const customdata = useMemo(
    () =>
      matrix.map((row) => row.map((val) => (val === 1 ? 'Present' : 'Missing'))),
    [matrix],
  );

  const trace = useMemo(
    () => {
      const colorscale: [number, string][] = isDark
        ? [[0, '#bfbfbf'], [1, '#141414']]
        : [[0, '#d32f2f'], [1, '#e8e8e8']];

      return {
        type: 'heatmap' as const,
        z: matrix,
        x: truncatedColumns,
        y: rowIndices,
        customdata,
        colorscale,
        zmin: 0,
        zmax: 1,
        showscale: false,
        hovertemplate: '%{x}<br>Row %{y}<br>%{customdata}<extra></extra>',
      } satisfies Record<string, unknown>;
    },
    [matrix, truncatedColumns, rowIndices, customdata, isDark],
  );

  const layout = useMemo(() => {
    const base = getPlotlyLayout(isDark);
    return {
      ...base,
      height,
      margin: { l: 48, r: 16, t: 24, b: 80 },
      xaxis: {
        ...(base.xaxis as object),
        tickangle: -45,
      },
      yaxis: {
        ...(base.yaxis as object),
        title: { text: 'Row Sample', standoff: 8 },
      },
    };
  }, [isDark, height]);

  return (
    <div className={className}>
      <PlotSuspense height={height} loadingLabel="Loading missing-value matrix…">
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

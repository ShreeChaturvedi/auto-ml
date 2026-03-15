import { useMemo } from 'react';
import type { Data, PlotMouseEvent } from 'plotly.js';
import type { CorrelationData } from '@/types/file';
import { LazyPlot, PlotSuspense, PLOTLY_CONFIG, getPlotlyLayout, EDA_COLORSCALES, useIsDark } from './edaTheme';
import { truncateText } from './edaFormatters';

interface PlotlyHeatmapProps {
  correlations: CorrelationData[];
  numericColumns: string[];
  onCellClick?: (columnA: string, columnB: string) => void;
  height?: number;
  className?: string;
}

export function PlotlyHeatmap({
  correlations,
  numericColumns,
  onCellClick,
  height = 400,
  className,
}: PlotlyHeatmapProps) {
  const isDark = useIsDark();

  const { matrix, textMatrix } = useMemo(() => {
    const n = numericColumns.length;
    const mat: (number | null)[][] = Array.from({ length: n }, () => Array(n).fill(null) as (number | null)[]);
    const txt: string[][] = Array.from({ length: n }, () => Array(n).fill('') as string[]);

    // Diagonal = 1.0
    for (let i = 0; i < n; i++) {
      mat[i][i] = 1.0;
      txt[i][i] = '1.00';
    }

    // Fill symmetric pairs from correlation data
    const colIndex = new Map(numericColumns.map((c, i) => [c, i]));
    for (const { columnA, columnB, coefficient } of correlations) {
      const i = colIndex.get(columnA);
      const j = colIndex.get(columnB);
      if (i !== undefined && j !== undefined) {
        mat[i][j] = coefficient;
        mat[j][i] = coefficient;
        const formatted = coefficient.toFixed(2);
        txt[i][j] = formatted;
        txt[j][i] = formatted;
      }
    }

    return { matrix: mat, textMatrix: txt };
  }, [correlations, numericColumns]);

  const layout = useMemo(() => {
    const base = getPlotlyLayout(isDark);
    return {
      ...base,
      height,
      margin: { l: 80, r: 40, t: 24, b: 80 },
      xaxis: {
        ...(base.xaxis as object),
        tickangle: -45,
      },
      yaxis: {
        ...(base.yaxis as object),
        autorange: 'reversed' as const,
      },
    };
  }, [isDark, height]);

  const truncatedColumns = useMemo(
    () => numericColumns.map((c) => truncateText(c, 20)),
    [numericColumns],
  );

  const trace = useMemo(
    () =>
      ({
        type: 'heatmap' as const,
        z: matrix,
        x: truncatedColumns,
        y: truncatedColumns,
        colorscale: EDA_COLORSCALES.rdbu(isDark),
        zmin: -1,
        zmax: 1,
        text: textMatrix as unknown as string[],
        texttemplate: '%{text}',
        textfont: { family: 'ui-monospace, monospace', size: 10 },
        hovertemplate: '%{x} vs %{y}: r = %{z:.3f}<extra></extra>',
        colorbar: {
          title: { text: 'r', side: 'right' },
          thickness: 12,
        },
      }) satisfies Record<string, unknown>,
    [matrix, textMatrix, truncatedColumns, isDark],
  );

  return (
    <div className={className}>
      <PlotSuspense height={height}>
        <LazyPlot
          data={[trace] as Data[]}
          layout={layout}
          config={PLOTLY_CONFIG}
          onClick={(event: Readonly<PlotMouseEvent>) => {
            if (onCellClick && event.points?.[0]) {
              const pt = event.points[0];
              const colA = String(pt.x);
              const colB = String(pt.y);
              if (colA !== colB) onCellClick(colA, colB);
            }
          }}
          className="w-full"
        />
      </PlotSuspense>
    </div>
  );
}

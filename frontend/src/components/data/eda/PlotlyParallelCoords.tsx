import { useMemo } from 'react';
import { Rows3 } from 'lucide-react';
import { PlotEmptyState } from './PlotEmptyState';
import {
  LazyPlot,
  PlotSuspense,
  PLOTLY_CONFIG,
  getPlotlyLayout,
  EDA_COLORSCALES,
  useIsDark,
} from './edaTheme';
import { truncateText } from './edaFormatters';
import { subsampleRows } from './edaDataUtils';

const MAX_ROWS = 1000;
const MAX_DIMS = 12;

interface PlotlyParallelCoordsProps {
  rows: Record<string, unknown>[];
  numericColumns: Array<{ column: string; min: number; max: number }>;
  height?: number;
  className?: string;
}

export function PlotlyParallelCoords({
  rows,
  numericColumns,
  height = 350,
  className,
}: PlotlyParallelCoordsProps) {
  const isDark = useIsDark();

  const cols = useMemo(() => numericColumns.slice(0, MAX_DIMS), [numericColumns]);

  const sampled = useMemo(() => subsampleRows(rows, MAX_ROWS), [rows]);

  const trace = useMemo(() => {
    const dimensions = cols.map((c) => ({
      label: truncateText(c.column, 12),
      values: sampled.map((r) => {
        const v = Number(r[c.column]);
        return Number.isFinite(v) ? v : null;
      }),
      range: [c.min, c.max],
    }));

    // Color by first column's values (reuse already-computed dimension values)
    const firstColValues = dimensions[0]?.values.map((v: number | null) => v ?? 0) ?? [];

    return {
      type: 'parcoords' as const,
      dimensions,
      line: {
        color: firstColValues,
        colorscale: EDA_COLORSCALES.viridis,
      },
    };
  }, [cols, sampled]);

  const layout = useMemo(() => {
    const base = getPlotlyLayout(isDark);
    return {
      ...base,
      height,
      margin: { l: 48, r: 48, t: 24, b: 24 },
    };
  }, [isDark, height]);

  // Guard: empty or insufficient columns
  if (!rows || rows.length === 0 || cols.length < 2) {
    return <PlotEmptyState icon={Rows3} message="Need at least 2 numeric columns and row data for parallel coordinates" className={className} />;
  }

  return (
    <div className={className}>
      <PlotSuspense height={height} loadingLabel="Rendering parallel coordinates...">
        <LazyPlot
          data={[trace]}
          layout={layout}
          config={PLOTLY_CONFIG}
          className="w-full"
        />
      </PlotSuspense>
    </div>
  );
}

import { useMemo } from 'react';
import {
  LazyPlot,
  PlotSuspense,
  PLOTLY_CONFIG,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
} from './edaTheme';
import { truncateText } from './edaFormatters';
import { subsampleRows } from './edaDataUtils';
import { PlotEmptyState } from './PlotEmptyState';

const MAX_ROWS = 500;
const MAX_COLS = 6;

interface PlotlyPairPlotProps {
  rows: Record<string, unknown>[];
  numericColumns: Array<{ column: string }>;
  height?: number;
  className?: string;
}

export function PlotlyPairPlot({
  rows,
  numericColumns,
  height = 500,
  className,
}: PlotlyPairPlotProps) {
  const isDark = useIsDark();

  const cols = useMemo(() => numericColumns.slice(0, MAX_COLS), [numericColumns]);
  const cappedMessage = numericColumns.length > MAX_COLS;

  const sampled = useMemo(() => subsampleRows(rows, MAX_ROWS), [rows]);

  const dimensions = useMemo(
    () =>
      cols.map((c) => ({
        label: truncateText(c.column, 12),
        values: sampled.map((r) => {
          const v = Number(r[c.column]);
          return Number.isFinite(v) ? v : null;
        }),
      })),
    [cols, sampled],
  );

  const trace = useMemo(() => {
    const colors = getEdaColors(isDark);
    return {
      type: 'splom' as const,
      dimensions,
      marker: {
        color: colors[0],
        opacity: 0.5,
        size: 3,
      },
      diagonal: { visible: true },
      showupperhalf: true,
      showlowerhalf: true,
    };
  }, [dimensions, isDark]);

  const layout = useMemo(() => {
    const base = getPlotlyLayout(isDark);
    return {
      ...base,
      height,
      margin: { l: 48, r: 16, t: 24, b: 48 },
      dragmode: 'select' as const,
    };
  }, [isDark, height]);

  // Guard: empty rows or insufficient columns
  if (!rows || rows.length === 0 || cols.length < 2) {
    return <PlotEmptyState message="Need at least 2 numeric columns and row data for pair plot" className={className} />;
  }

  return (
    <div className={className}>
      {cappedMessage && (
        <p className="text-xs text-muted-foreground mb-1 px-1">
          Showing first {MAX_COLS} of {numericColumns.length} numeric columns.
        </p>
      )}
      <PlotSuspense height={height} loadingLabel="Rendering pair plot...">
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

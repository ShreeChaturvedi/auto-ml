import { useState, useMemo } from 'react';
import { Box } from 'lucide-react';
import { PlotEmptyState } from './PlotEmptyState';
import {
  LazyPlot,
  PlotSuspense,
  PLOTLY_CONFIG_INTERACTIVE,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
} from './edaTheme';
import { subsampleRows } from './edaDataUtils';

const MAX_ROWS = 1000;

interface PlotlyScatter3DProps {
  rows: Record<string, unknown>[];
  numericColumns: Array<{ column: string }>;
  height?: number;
  className?: string;
}

export function PlotlyScatter3D({
  rows,
  numericColumns,
  height = 500,
  className,
}: PlotlyScatter3DProps) {
  const isDark = useIsDark();
  const columnNames = useMemo(() => numericColumns.map((c) => c.column), [numericColumns]);

  const [xCol, setXCol] = useState(() => columnNames[0] ?? '');
  const [yCol, setYCol] = useState(() => columnNames[1] ?? '');
  const [zCol, setZCol] = useState(() => columnNames[2] ?? '');

  const sampled = useMemo(() => subsampleRows(rows, MAX_ROWS), [rows]);

  const trace = useMemo(() => {
    const colors = getEdaColors(isDark);
    return {
      type: 'scatter3d' as const,
      mode: 'markers' as const,
      x: sampled.map((r) => {
        const v = Number(r[xCol]);
        return Number.isFinite(v) ? v : null;
      }),
      y: sampled.map((r) => {
        const v = Number(r[yCol]);
        return Number.isFinite(v) ? v : null;
      }),
      z: sampled.map((r) => {
        const v = Number(r[zCol]);
        return Number.isFinite(v) ? v : null;
      }),
      marker: {
        size: 3,
        opacity: 0.7,
        color: colors[0],
      },
      hovertemplate: `${xCol}: %{x}<br>${yCol}: %{y}<br>${zCol}: %{z}<extra></extra>`,
    };
  }, [sampled, xCol, yCol, zCol, isDark]);

  const layout = useMemo(() => {
    const base = getPlotlyLayout(isDark);
    const gridColor = (base.xaxis as Record<string, unknown>)?.gridcolor as string ?? 'rgba(255,255,255,0.1)';
    return {
      ...base,
      height,
      margin: { l: 0, r: 0, t: 24, b: 0 },
      scene: {
        bgcolor: 'transparent',
        xaxis: {
          gridcolor: gridColor,
          showbackground: false,
          title: xCol,
        },
        yaxis: {
          gridcolor: gridColor,
          showbackground: false,
          title: yCol,
        },
        zaxis: {
          gridcolor: gridColor,
          showbackground: false,
          title: zCol,
        },
      },
    };
  }, [isDark, height, xCol, yCol, zCol]);

  // Guard: need at least 3 numeric columns
  if (!rows || rows.length === 0 || columnNames.length < 3) {
    return <PlotEmptyState icon={Box} message="Need at least 3 numeric columns and row data for 3D scatter" className={className} />;
  }

  return (
    <div className={className}>
      {/* Axis selectors */}
      <div className="flex items-center gap-3 mb-2 px-1">
        {([
          { label: 'X', value: xCol, setter: setXCol },
          { label: 'Y', value: yCol, setter: setYCol },
          { label: 'Z', value: zCol, setter: setZCol },
        ] as const).map(({ label, value, setter }) => (
          <label key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium">{label}</span>
            <select
              value={value}
              onChange={(e) => setter(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {columnNames.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <PlotSuspense height={height} loadingLabel="Rendering 3D scatter...">
        <LazyPlot
          data={[trace]}
          layout={layout}
          config={PLOTLY_CONFIG_INTERACTIVE}
          className="w-full"
        />
      </PlotSuspense>
    </div>
  );
}

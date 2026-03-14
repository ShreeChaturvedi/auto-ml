import { useMemo } from 'react';
import type { ScatterData } from '@/types/file';
import { LazyPlot, PlotSuspense, PLOTLY_CONFIG, getPlotlyLayout, useIsDark } from './edaTheme';
import { getCorrelationLabel } from './edaFormatters';

interface PlotlyScatterProps {
  data: ScatterData;
  correlation?: number;
  height?: number;
  className?: string;
}

export function PlotlyScatter({
  data,
  correlation,
  height = 300,
  className,
}: PlotlyScatterProps) {
  const isDark = useIsDark();

  const trace = useMemo(
    () => ({
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: data.points.map((p) => p.x),
      y: data.points.map((p) => p.y),
      marker: {
        color: 'hsl(var(--primary))',
        opacity: 0.6,
        size: 6,
      },
    }),
    [data.points],
  );

  const layout = useMemo(() => {
    const base = getPlotlyLayout(isDark);
    return {
      ...base,
      height,
      xaxis: {
        ...(base.xaxis as object),
        title: { text: data.xColumn, standoff: 8 },
      },
      yaxis: {
        ...(base.yaxis as object),
        title: { text: data.yColumn, standoff: 8 },
      },
      annotations:
        correlation !== undefined
          ? [
              {
                text: `r = ${correlation.toFixed(2)} (${getCorrelationLabel(correlation)})`,
                xref: 'paper' as const,
                yref: 'paper' as const,
                x: 0.98,
                y: 0.98,
                showarrow: false,
                font: { size: 11, family: 'monospace' },
                bgcolor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
                borderpad: 4,
              },
            ]
          : [],
    };
  }, [isDark, height, data.xColumn, data.yColumn, correlation]);

  return (
    <div className={className}>
      <PlotSuspense height={height}>
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

import { useMemo } from 'react';
import type { EvaluationResult } from '@/types/experiments';
import {
  LazyPlot,
  PlotSuspense,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
  PLOTLY_CONFIG_INTERACTIVE,
} from '@/components/data/eda/edaTheme';

interface ResidualHistogramChartProps {
  data: EvaluationResult['residual_histogram'];
  height?: number;
}

export function ResidualHistogramChart({ data, height = 400 }: ResidualHistogramChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!data) return { plotData: [], layout: {} };

    const colors = getEdaColors(isDark);
    const { bin_edges, counts } = data;

    // Compute midpoints from bin_edges (n+1 edges => n bins)
    const midpoints = [];
    for (let i = 0; i < bin_edges.length - 1; i++) {
      midpoints.push((bin_edges[i] + bin_edges[i + 1]) / 2);
    }

    const barTrace = {
      type: 'bar' as const,
      x: midpoints,
      y: counts,
      marker: {
        color: colors[0],
        opacity: 0.7,
        line: { color: colors[0], width: 1 },
      },
      showlegend: false,
      customdata: bin_edges.slice(0, -1).map((edge, i) => [edge, bin_edges[i + 1]]),
      hovertemplate: '%{customdata[0]:.3f} \u2013 %{customdata[1]:.3f}<br>Count: %{y}<extra></extra>',
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'Residual', standoff: 8 },
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: 'Count', standoff: 8 },
      },
      showlegend: false,
    };

    return { plotData: [barTrace], layout: mergedLayout };
  }, [data, isDark, height]);

  return (
    <PlotSuspense height={height}>
      <LazyPlot
        data={plotData}
        layout={layout}
        config={PLOTLY_CONFIG_INTERACTIVE}
        style={{ width: '100%', height }}
      />
    </PlotSuspense>
  );
}

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

interface ResidualsChartProps {
  data: EvaluationResult['residuals'];
  height?: number;
}

export function ResidualsChart({ data, height = 400 }: ResidualsChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!data) return { plotData: [], layout: {} };

    const colors = getEdaColors(isDark);

    // Scatter plot: x=y_pred, y=residuals
    const scatterTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: data.y_pred,
      y: data.residuals,
      marker: {
        color: colors[0],
        opacity: 0.6,
        size: 5,
      },
      showlegend: false,
      hovertemplate: 'Predicted: %{x:.3f}<br>Residual: %{y:.3f}<extra></extra>',
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'Predicted Value', standoff: 8 },
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: 'Residual', standoff: 8 },
      },
      // Horizontal reference line at y=0
      shapes: [
        {
          type: 'line' as const,
          x0: 0,
          x1: 1,
          xref: 'paper' as const,
          y0: 0,
          y1: 0,
          line: {
            color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
            width: 1.5,
            dash: 'dash' as const,
          },
        },
      ],
    };

    return { plotData: [scatterTrace], layout: mergedLayout };
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

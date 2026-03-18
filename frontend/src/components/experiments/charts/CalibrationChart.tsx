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

interface CalibrationChartProps {
  data: EvaluationResult['calibration_curve'];
  height?: number;
}

export function CalibrationChart({ data, height = 400 }: CalibrationChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!data) return { plotData: [], layout: {} };

    const colors = getEdaColors(isDark);

    // Scatter plot of prob_true vs prob_pred
    const scatterTrace = {
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      x: data.prob_pred,
      y: data.prob_true,
      name: 'Calibration',
      marker: { color: colors[0], size: 7 },
      line: { color: colors[0], width: 2 },
      hovertemplate: 'Mean predicted: %{x:.3f}<br>Fraction positive: %{y:.3f}<extra></extra>',
    };

    // Diagonal reference line (perfectly calibrated)
    const diagonalTrace = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: [0, 1],
      y: [0, 1],
      name: 'Perfectly calibrated',
      line: {
        color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
        width: 1.5,
        dash: 'dash' as const,
      },
      showlegend: true,
      hoverinfo: 'skip' as const,
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'Mean Predicted Probability', standoff: 8 },
        range: [0, 1],
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: 'Fraction of Positives', standoff: 8 },
        range: [0, 1.05],
      },
      legend: {
        x: 0,
        y: 1,
        xanchor: 'left' as const,
        yanchor: 'top' as const,
        bgcolor: 'transparent',
        font: { size: 10 },
      },
    };

    return { plotData: [scatterTrace, diagonalTrace], layout: mergedLayout };
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

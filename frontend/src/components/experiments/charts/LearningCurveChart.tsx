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

interface LearningCurveChartProps {
  data: EvaluationResult['learning_curve'];
  height?: number;
}

export function LearningCurveChart({ data, height = 400 }: LearningCurveChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!data) return { plotData: [], layout: {} };
    const colors = getEdaColors(isDark);
    const { train_sizes, train_scores_mean, train_scores_std, test_scores_mean, test_scores_std } = data;

    // Train score upper bound (for fill region)
    const trainUpper = train_scores_mean.map((m, i) => m + train_scores_std[i]);
    // Train score lower bound
    const trainLower = train_scores_mean.map((m, i) => m - train_scores_std[i]);
    // Test score upper bound
    const testUpper = test_scores_mean.map((m, i) => m + test_scores_std[i]);
    // Test score lower bound
    const testLower = test_scores_mean.map((m, i) => m - test_scores_std[i]);

    // Train std fill band (lower then upper reversed to close the shape)
    const trainFillLower = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: train_sizes,
      y: trainLower,
      line: { color: 'transparent' },
      showlegend: false,
      hoverinfo: 'skip' as const,
    };

    const trainFillUpper = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: train_sizes,
      y: trainUpper,
      fill: 'tonexty' as const,
      fillcolor: colors[0].replace(')', ', 0.15)').replace('hsl(', 'hsla('),
      line: { color: 'transparent' },
      showlegend: false,
      hoverinfo: 'skip' as const,
    };

    // Train mean line
    const trainMean = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: train_sizes,
      y: train_scores_mean,
      name: 'Train',
      line: { color: colors[0], width: 2 },
      hovertemplate: 'Size: %{x}<br>Score: %{y:.4f}<extra>Train</extra>',
    };

    // Test std fill band
    const testFillLower = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: train_sizes,
      y: testLower,
      line: { color: 'transparent' },
      showlegend: false,
      hoverinfo: 'skip' as const,
    };

    const testFillUpper = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: train_sizes,
      y: testUpper,
      fill: 'tonexty' as const,
      fillcolor: colors[1].replace(')', ', 0.15)').replace('hsl(', 'hsla('),
      line: { color: 'transparent' },
      showlegend: false,
      hoverinfo: 'skip' as const,
    };

    // Test mean line
    const testMean = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: train_sizes,
      y: test_scores_mean,
      name: 'Test',
      line: { color: colors[1], width: 2 },
      hovertemplate: 'Size: %{x}<br>Score: %{y:.4f}<extra>Test</extra>',
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'Training Set Size', standoff: 8 },
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: 'Score', standoff: 8 },
      },
      legend: {
        x: 1,
        y: 0,
        xanchor: 'right' as const,
        yanchor: 'bottom' as const,
        bgcolor: 'transparent',
        font: { size: 10 },
      },
    };

    return {
      plotData: [trainFillLower, trainFillUpper, trainMean, testFillLower, testFillUpper, testMean],
      layout: mergedLayout,
    };
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

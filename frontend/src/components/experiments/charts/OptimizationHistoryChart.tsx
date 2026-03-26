import { useMemo } from 'react';
import type { TuningTrialEvent } from '@/types/experiments';
import {
  LazyPlot,
  PlotSuspense,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
  PLOTLY_CONFIG_INTERACTIVE,
} from '@/components/data/eda/edaTheme';

interface OptimizationHistoryChartProps {
  trials: TuningTrialEvent[];
  height?: number;
  /** When metric starts with 'neg_' or is r2/accuracy/f1/etc, direction is 'maximize'.
   *  For raw error metrics (rmse, mae, mse), direction is 'minimize'. Defaults to 'maximize'. */
  direction?: 'maximize' | 'minimize';
}

export function OptimizationHistoryChart({ trials, height = 350, direction = 'maximize' }: OptimizationHistoryChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    // Only show COMPLETE trials with a numeric value
    const complete = trials.filter((t) => t.state === 'COMPLETE' && t.value != null);
    if (complete.length === 0) return { plotData: [], layout: {} };

    const colors = getEdaColors(isDark);
    const trialNumbers = complete.map((t) => t.trial_number);
    const values = complete.map((t) => t.value as number);

    // Compute running best (direction-aware)
    const bestSoFar: number[] = [];
    let runningBest = values[0];
    const isBetter = direction === 'minimize' ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
    for (const v of values) {
      if (isBetter(v, runningBest)) runningBest = v;
      bestSoFar.push(runningBest);
    }

    const objectiveTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      x: trialNumbers,
      y: values,
      name: 'Objective Value',
      marker: { color: colors[0], size: 7, opacity: 0.7 },
      hovertemplate: 'Trial %{x}<br>Value: %{y:.4f}<extra>Objective</extra>',
    };

    const bestTrace = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: trialNumbers,
      y: bestSoFar,
      name: 'Best So Far',
      line: { color: colors[2], width: 2.5, shape: 'hv' as const },
      hovertemplate: 'Trial %{x}<br>Best: %{y:.4f}<extra>Best So Far</extra>',
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'Trial', standoff: 8 },
        dtick: complete.length <= 20 ? 1 : undefined,
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: 'Objective Value', standoff: 8 },
      },
      legend: {
        x: 1,
        y: 1,
        xanchor: 'right' as const,
        yanchor: 'top' as const,
        bgcolor: 'transparent',
        font: { size: 10 },
      },
    };

    return { plotData: [objectiveTrace, bestTrace], layout: mergedLayout };
  }, [trials, isDark, height, direction]);

  if (plotData.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-muted/30 text-sm text-muted-foreground"
        style={{ height }}
      >
        Waiting for completed trials...
      </div>
    );
  }

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

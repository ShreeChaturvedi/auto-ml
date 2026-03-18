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

interface PrCurveChartProps {
  data: EvaluationResult['precision_recall_curves'];
  height?: number;
}

export function PrCurveChart({ data, height = 400 }: PrCurveChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!data) return { plotData: [], layout: {} };

    const colors = getEdaColors(isDark);
    const classes = Object.keys(data);

    const traces = classes.map((cls, i) => {
      const curve = data[cls];
      return {
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: curve.recall,
        y: curve.precision,
        name: `${cls} (AP=${curve.ap.toFixed(2)})`,
        line: { color: colors[i % colors.length], width: 2 },
        hovertemplate: `Recall: %{x:.3f}<br>Precision: %{y:.3f}<extra>${cls}</extra>`,
      };
    });

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'Recall', standoff: 8 },
        range: [0, 1],
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: 'Precision', standoff: 8 },
        range: [0, 1.05],
      },
      legend: {
        x: 0,
        y: 0,
        xanchor: 'left' as const,
        yanchor: 'bottom' as const,
        bgcolor: 'transparent',
        font: { size: 10 },
      },
    };

    return { plotData: traces, layout: mergedLayout };
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

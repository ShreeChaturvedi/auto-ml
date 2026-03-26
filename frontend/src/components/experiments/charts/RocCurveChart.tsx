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

interface RocCurveChartProps {
  data: EvaluationResult['roc_curves'];
  height?: number;
}

export function RocCurveChart({ data, height = 400 }: RocCurveChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!data) return { plotData: [], layout: {} };

    const colors = getEdaColors(isDark);
    const classes = Object.keys(data);

    // One line trace per class
    const traces = classes.map((cls, i) => {
      const curve = data[cls];
      return {
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: curve.fpr,
        y: curve.tpr,
        name: `${cls} (AUC=${curve.auc.toFixed(2)})`,
        line: { color: colors[i % colors.length], width: 2 },
        hovertemplate: `FPR: %{x:.3f}<br>TPR: %{y:.3f}<extra>${cls}</extra>`,
      };
    });

    // Diagonal reference line (dashed, gray)
    const diagonalTrace = {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: [0, 1],
      y: [0, 1],
      name: 'Random',
      line: {
        color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
        width: 1.5,
        dash: 'dash' as const,
      },
      showlegend: false,
      hoverinfo: 'skip' as const,
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'False Positive Rate', standoff: 8 },
        range: [0, 1],
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: 'True Positive Rate', standoff: 8 },
        range: [0, 1.05],
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

    return { plotData: [...traces, diagonalTrace], layout: mergedLayout };
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

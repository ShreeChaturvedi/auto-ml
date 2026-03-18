import { useMemo } from 'react';
import type { EvaluationResult } from '@/types/experiments';
import {
  LazyPlot,
  PlotSuspense,
  getPlotlyLayout,
  EDA_COLORSCALES,
  useIsDark,
  PLOTLY_CONFIG_INTERACTIVE,
} from '@/components/data/eda/edaTheme';

interface ConfusionMatrixChartProps {
  data: EvaluationResult['confusion_matrix'];
  height?: number;
}

export function ConfusionMatrixChart({ data, height = 400 }: ConfusionMatrixChartProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!data) return { plotData: [], layout: {} };

    const { matrix, matrix_normalized, labels } = data;

    // Build text overlay: show raw counts on each cell
    const textMatrix = matrix.map((row) =>
      row.map((val) => String(val)),
    );

    const trace = {
      type: 'heatmap' as const,
      z: matrix_normalized,
      x: labels,
      y: labels,
      colorscale: EDA_COLORSCALES.rdbu(isDark),
      zmin: 0,
      zmax: 1,
      text: textMatrix as unknown as string[],
      texttemplate: '%{text}',
      textfont: { family: 'ui-monospace, monospace', size: 11 },
      hovertemplate: 'True: %{y}<br>Predicted: %{x}<br>Count: %{text}<br>Normalized: %{z:.3f}<extra></extra>',
      colorbar: {
        title: { text: 'Normalized', side: 'right' as const },
        thickness: 12,
        outlinecolor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
        tickfont: {
          color: isDark ? 'hsl(0,0%,64%)' : 'hsl(215.4,16.3%,46.9%)',
          size: 10,
        },
      },
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      margin: { l: 80, r: 40, t: 24, b: 80 },
      xaxis: {
        ...(baseLayout.xaxis as object),
        title: { text: 'Predicted', standoff: 8 },
      },
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: 'True', standoff: 8 },
        autorange: 'reversed' as const,
      },
    };

    return { plotData: [trace], layout: mergedLayout };
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

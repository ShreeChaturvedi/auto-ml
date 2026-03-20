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

interface CvBoxplotProps {
  data: EvaluationResult['cross_validation'];
  height?: number;
}

export function CvBoxplot({ data, height = 400 }: CvBoxplotProps) {
  const isDark = useIsDark();

  const { plotData, layout } = useMemo(() => {
    if (!data) return { plotData: [], layout: {} };
    const colors = getEdaColors(isDark);
    const { scores, mean, std, scoring } = data;

    const trace = {
      type: 'box' as const,
      y: scores,
      name: scoring,
      marker: { color: colors[0] },
      line: { color: colors[0] },
      boxmean: true as const,
      hoverinfo: 'y' as const,
    };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height,
      yaxis: {
        ...(baseLayout.yaxis as object),
        title: { text: scoring, standoff: 8 },
      },
      showlegend: false,
      annotations: [
        {
          text: `Mean: ${mean.toFixed(3)} \u00B1 ${std.toFixed(3)}`,
          xref: 'paper' as const,
          yref: 'paper' as const,
          x: 0.98,
          y: 0.98,
          showarrow: false,
          font: { size: 11, family: 'ui-monospace, monospace' },
          bgcolor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
          borderpad: 4,
        },
      ],
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

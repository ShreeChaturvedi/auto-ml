import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useModelStore } from '@/stores/modelStore';
import type { EvaluationResult } from '@/types/experiments';
import {
  LazyPlot,
  PlotSuspense,
  getPlotlyLayout,
  getEdaColors,
  useIsDark,
  PLOTLY_CONFIG_INTERACTIVE,
} from '@/components/data/eda/edaTheme';

export function OverlaidLearningCurves({
  modelIds,
  evaluations,
}: {
  modelIds: string[];
  evaluations: Record<string, EvaluationResult>;
}) {
  const isDark = useIsDark();
  const models = useModelStore((s) => s.models);

  const { plotData, layout, hasData } = useMemo(() => {
    const colors = getEdaColors(isDark);
    const traces: Record<string, unknown>[] = [];

    modelIds.forEach((id, mIdx) => {
      const eval_ = evaluations[id];
      const model = models.find((m) => m.modelId === id);
      if (!eval_?.learning_curve || !model) return;

      const { train_sizes, test_scores_mean } = eval_.learning_curve;
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: train_sizes,
        y: test_scores_mean,
        name: model.name,
        line: { color: colors[mIdx % colors.length], width: 2 },
        hovertemplate: `Size: %{x}<br>Test Score: %{y:.4f}<extra>${model.name}</extra>`,
      });
    });

    if (traces.length === 0) return { plotData: [], layout: {}, hasData: false };

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height: 350,
      xaxis: { ...(baseLayout.xaxis as object), title: { text: 'Training Set Size', standoff: 8 } },
      yaxis: { ...(baseLayout.yaxis as object), title: { text: 'Test Score', standoff: 8 } },
      legend: { x: 1, y: 0, xanchor: 'right' as const, yanchor: 'bottom' as const, bgcolor: 'transparent', font: { size: 10 } },
    };

    return { plotData: traces, layout: mergedLayout, hasData: true };
  }, [modelIds, evaluations, models, isDark]);

  if (!hasData) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Learning Curves (Overlay)</CardTitle>
      </CardHeader>
      <CardContent>
        <PlotSuspense height={350}>
          <LazyPlot data={plotData} layout={layout} config={PLOTLY_CONFIG_INTERACTIVE} style={{ width: '100%', height: 350 }} />
        </PlotSuspense>
      </CardContent>
    </Card>
  );
}

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

export function OverlaidRocCurves({
  modelIds,
  evaluations,
}: {
  modelIds: string[];
  evaluations: Record<string, EvaluationResult | null>;
}) {
  const isDark = useIsDark();
  const models = useModelStore((s) => s.models);

  const { plotData, layout, hasData } = useMemo(() => {
    const colors = getEdaColors(isDark);
    const traces: Record<string, unknown>[] = [];

    modelIds.forEach((id, mIdx) => {
      const eval_ = evaluations[id];
      const model = models.find((m) => m.modelId === id);
      if (!eval_?.roc_curves || !model) return;

      const classes = Object.keys(eval_.roc_curves);
      const cls = classes.find((c) => c.toLowerCase().includes('macro')) ?? classes[0];
      if (!cls) return;

      const curve = eval_.roc_curves[cls];
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: curve.fpr,
        y: curve.tpr,
        name: `${model.name} (AUC=${curve.auc.toFixed(2)})`,
        line: { color: colors[mIdx % colors.length], width: 2 },
        hovertemplate: `FPR: %{x:.3f}<br>TPR: %{y:.3f}<extra>${model.name}</extra>`,
      });
    });

    if (traces.length === 0) return { plotData: [], layout: {}, hasData: false };

    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: [0, 1],
      y: [0, 1],
      name: 'Random',
      line: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', width: 1.5, dash: 'dash' },
      showlegend: false,
      hoverinfo: 'skip',
    });

    const baseLayout = getPlotlyLayout(isDark);
    const mergedLayout = {
      ...baseLayout,
      height: 350,
      xaxis: { ...(baseLayout.xaxis as object), title: { text: 'False Positive Rate', standoff: 8 }, range: [0, 1] },
      yaxis: { ...(baseLayout.yaxis as object), title: { text: 'True Positive Rate', standoff: 8 }, range: [0, 1.05] },
      legend: { x: 1, y: 0, xanchor: 'right' as const, yanchor: 'bottom' as const, bgcolor: 'transparent', font: { size: 10 } },
    };

    return { plotData: traces, layout: mergedLayout, hasData: true };
  }, [modelIds, evaluations, models, isDark]);

  if (!hasData) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ROC Curves (Overlay)</CardTitle>
      </CardHeader>
      <CardContent>
        <PlotSuspense height={350}>
          <LazyPlot data={plotData} layout={layout} config={PLOTLY_CONFIG_INTERACTIVE} style={{ width: '100%', height: 350 }} />
        </PlotSuspense>
      </CardContent>
    </Card>
  );
}

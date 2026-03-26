import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';
import { MetricsDeltaTable } from './MetricsDeltaTable';
import { OverlaidRocCurves } from './OverlaidRocCurves';
import { OverlaidLearningCurves } from './OverlaidLearningCurves';

function CompareNarrativeSection() {
  const { projectId } = useParams<{ projectId: string }>();
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const compareNarrative = useExperimentsStore((s) => s.compareNarrative);
  const fetchCompareNarrative = useExperimentsStore((s) => s.fetchCompareNarrative);
  const models = useModelStore((s) => s.models);

  useEffect(() => {
    if (projectId && comparisonModelIds.length >= 2) {
      void fetchCompareNarrative(projectId, comparisonModelIds, models);
    }
  }, [projectId, comparisonModelIds, fetchCompareNarrative, models]);

  if (!compareNarrative) {
    return <p className="text-sm text-muted-foreground italic">AI comparison unavailable.</p>;
  }

  if (compareNarrative.isLoading && !compareNarrative.text) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/60" />
      </div>
    );
  }

  if (!compareNarrative.text) {
    return <p className="text-sm text-muted-foreground italic">AI comparison unavailable.</p>;
  }

  return (
    <div className="flex items-start gap-2.5">
      <Brain className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <p className="text-sm text-foreground leading-relaxed">
        {compareNarrative.text}
        {compareNarrative.isLoading && (
          <span className="inline-block ml-1 h-3 w-1.5 animate-pulse bg-foreground/50 rounded-sm" />
        )}
      </p>
    </div>
  );
}

export function ComparisonView() {
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const evaluations = useExperimentsStore((s) => s.evaluations);
  const fetchEvaluation = useExperimentsStore((s) => s.fetchEvaluation);
  const models = useModelStore((s) => s.models);

  useEffect(() => {
    for (const id of comparisonModelIds) void fetchEvaluation(id);
  }, [comparisonModelIds, fetchEvaluation]);

  const hasRocData = useMemo(
    () =>
      comparisonModelIds.some((id) => {
        const m = models.find((mdl) => mdl.modelId === id);
        return m?.taskType === 'classification';
      }) && comparisonModelIds.some((id) => evaluations[id]?.roc_curves),
    [comparisonModelIds, models, evaluations],
  );

  const hasLearningCurveData = useMemo(
    () => comparisonModelIds.some((id) => evaluations[id]?.learning_curve),
    [comparisonModelIds, evaluations],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-5">
          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold tracking-tight">AI Comparison Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <CompareNarrativeSection />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold tracking-tight">Metrics Comparison</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <MetricsDeltaTable modelIds={comparisonModelIds} />
            </CardContent>
          </Card>

          {hasRocData && <OverlaidRocCurves modelIds={comparisonModelIds} evaluations={evaluations} />}
          {hasLearningCurveData && <OverlaidLearningCurves modelIds={comparisonModelIds} evaluations={evaluations} />}
        </div>
      </ScrollArea>
    </div>
  );
}

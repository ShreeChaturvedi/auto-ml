import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { X, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    if (projectId && comparisonModelIds.length >= 2) {
      void fetchCompareNarrative(projectId, comparisonModelIds);
    }
  }, [projectId, comparisonModelIds, fetchCompareNarrative]);

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
      <Sparkles className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
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
  const clearComparison = useExperimentsStore((s) => s.clearComparison);
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
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Comparing {comparisonModelIds.length} Models
          </h2>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={clearComparison}>
            <X className="h-3.5 w-3.5" />
            Clear Selection
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Comparison Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <CompareNarrativeSection />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Metrics Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricsDeltaTable modelIds={comparisonModelIds} />
          </CardContent>
        </Card>

        {hasRocData && <OverlaidRocCurves modelIds={comparisonModelIds} evaluations={evaluations} />}
        {hasLearningCurveData && <OverlaidLearningCurves modelIds={comparisonModelIds} evaluations={evaluations} />}
      </div>
    </ScrollArea>
  );
}

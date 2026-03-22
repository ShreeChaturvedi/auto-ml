import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trophy, Layers, Tag, Clock, ArrowRight, AlertTriangle, LayoutDashboard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useModelStore } from '@/stores/modelStore';
import type { ModelRecord, ModelTaskType } from '@/types/model';
import type { CrossPhaseRecommendation } from '@/types/experiments';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { cn } from '@/lib/utils';
import { formatMetric, formatDuration, generateRecommendations, PRIMARY_METRIC, detectTaskTypes } from './utils';
import { ModelsParallelCoords } from './ModelsParallelCoords';

const PRIMARY_METRIC_LABEL: Record<ModelTaskType, string> = {
  classification: 'Accuracy',
  regression: 'R\u00B2',
  clustering: 'Silhouette',
};

function findBestModel(
  models: ModelRecord[],
  taskTypes: ModelTaskType[],
): { model: ModelRecord; metricKey: string; metricLabel: string; value: number } | null {
  let best: { model: ModelRecord; metricKey: string; metricLabel: string; value: number } | null = null;
  for (const tt of taskTypes) {
    const key = PRIMARY_METRIC[tt];
    const label = PRIMARY_METRIC_LABEL[tt];
    for (const m of models) {
      if (m.taskType !== tt) continue;
      const val = m.metrics[key];
      if (val == null || !Number.isFinite(val)) continue;
      if (!best || val > best.value) best = { model: m, metricKey: key, metricLabel: label, value: val };
    }
  }
  return best;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card className={cn('flex-1 min-w-[140px]', className)}>
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        </div>
        <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  high: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  low: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

function RecommendationCard({ rec, onNavigate }: { rec: CrossPhaseRecommendation; onNavigate: (p: string) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px] capitalize', SEVERITY_STYLES[rec.severity])}>
            {rec.severity}
          </Badge>
          <span className="text-sm font-medium text-foreground">{rec.title}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{rec.detail}</p>
      </div>
      <Button variant="ghost" size="sm" className="shrink-0 text-xs gap-1" onClick={() => onNavigate(rec.target_phase)}>
        Go to Phase
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function OverviewDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const evaluations = useExperimentsStore((s) => s.evaluations);

  const taskTypes = useMemo(() => detectTaskTypes(models), [models]);
  const bestModel = useMemo(() => findBestModel(models, taskTypes), [models, taskTypes]);

  const avgTrainingTime = useMemo(() => {
    const withTime = models.filter((m) => m.trainingMs != null);
    if (withTime.length === 0) return null;
    return withTime.reduce((sum, m) => sum + (m.trainingMs ?? 0), 0) / withTime.length;
  }, [models]);

  const taskTypeLabel = useMemo(() => {
    if (taskTypes.length === 0) return 'None';
    if (taskTypes.length === 1) return taskTypes[0].charAt(0).toUpperCase() + taskTypes[0].slice(1);
    return 'Mixed';
  }, [taskTypes]);

  const recommendations = useMemo(() => generateRecommendations(models, evaluations), [models, evaluations]);

  const handleNavigateToPhase = (targetPhase: string) => {
    if (projectId) navigate(`/project/${projectId}/${targetPhase}`);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 items-center justify-between gap-3 border-b px-3 shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Overview</span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {models.length} model{models.length !== 1 ? 's' : ''} trained
        </span>
      </div>
      {models.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center space-y-2">
            <Trophy className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No models trained yet. Train your first model to see the overview dashboard.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-5 p-4">
            <div className="flex flex-wrap gap-3">
              {bestModel && <KpiCard icon={Trophy} label={`Best ${bestModel.metricLabel}`} value={formatMetric(bestModel.value)} />}
              <KpiCard icon={Layers} label="Total Models" value={String(models.length)} />
              <KpiCard icon={Tag} label="Task Type" value={taskTypeLabel} />
              {avgTrainingTime != null && <KpiCard icon={Clock} label="Avg Training Time" value={formatDuration(avgTrainingTime)} />}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Model Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ModelsParallelCoords models={models} />
              </CardContent>
            </Card>

            {recommendations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground px-1">Cross-Phase Recommendations</h3>
                {recommendations.map((rec, i) => (
                  <RecommendationCard key={`${rec.title}-${i}`} rec={rec} onNavigate={handleNavigateToPhase} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

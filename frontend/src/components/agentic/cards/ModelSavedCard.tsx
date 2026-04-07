/**
 * ModelSavedCard - Training chat card shown when register_model succeeds.
 *
 * Bridges the Training phase to the existing Experiments module. Instead of
 * rebuilding confusion-matrix / learning-curve / feature-importance charts
 * inside Training, we link to `ModelDetailPanel` which already renders all
 * of them via PlotsTab + InterpretabilityTab + the 15+ Plotly chart
 * components under `frontend/src/components/experiments/charts/`.
 *
 * Rendered by useLifecycleCards when a `register_model` tool result arrives
 * with `status: 'registered'` and a populated `modelId`. Supersedes the
 * generic CommitBadge for this specific tool.
 *
 * Clustering models are handled specially: the background evaluation service
 * at `evaluationService.ts:377-379` skips clustering, so a clustering model's
 * ModelDetailPanel would show a permanently-pending evaluation state. For
 * those models the "Open details" button is disabled with a tooltip.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface ModelSavedCardProps {
  projectId: string;
  modelId: string | undefined;
  modelName: string;
  modelType: string;
  taskType: 'classification' | 'regression' | 'clustering' | string;
  metrics: Record<string, number> | undefined;
  artifactSize?: number;
}

const TASK_TONES: Record<string, string> = {
  classification: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300',
  regression: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  clustering: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300'
};

function formatBytes(size: number | undefined): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns the top-N metrics as {key, value} pairs, ordered by the task-type
 * convention (accuracy/f1 first for classification, RMSE/R² first for
 * regression) so the primary metric sits on the left.
 */
function prioritizeMetrics(
  metrics: Record<string, number> | undefined,
  taskType: string
): Array<{ key: string; value: number }> {
  if (!metrics) return [];
  const entries = Object.entries(metrics).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v)
  ) as Array<[string, number]>;
  if (entries.length === 0) return [];

  const order = taskType === 'regression'
    ? ['rmse', 'mae', 'r2', 'r_squared']
    : taskType === 'classification'
      ? ['accuracy', 'f1', 'precision', 'recall', 'auc', 'roc_auc']
      : ['silhouette', 'inertia'];

  const lower = (k: string) => k.toLowerCase();
  entries.sort(([a], [b]) => {
    const ia = order.indexOf(lower(a));
    const ib = order.indexOf(lower(b));
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return entries.slice(0, 4).map(([key, value]) => ({ key, value }));
}

function formatMetricValue(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  if (abs >= 1000 || abs === 0) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(2);
  return value.toFixed(4);
}

export function ModelSavedCard({
  projectId,
  modelId,
  modelName,
  modelType,
  taskType,
  metrics,
  artifactSize
}: ModelSavedCardProps) {
  const navigate = useNavigate();
  const primaryMetrics = prioritizeMetrics(metrics, taskType);
  const sizeLabel = formatBytes(artifactSize);
  const toneClass = TASK_TONES[taskType] ?? 'bg-muted text-muted-foreground border-border';

  // Clustering models skip the Experiments evaluation pipeline entirely
  // (see evaluationService.ts:377-379), so ModelDetailPanel would show a
  // permanently-pending state. Disable the CTA for them.
  const canOpenDetails = Boolean(modelId) && taskType !== 'clustering';
  const disabledReason = !modelId
    ? 'Model was saved but the backend did not return a model id.'
    : taskType === 'clustering'
      ? 'Clustering models do not produce the evaluation plots the details panel renders.'
      : null;

  const handleOpen = () => {
    if (!modelId || !canOpenDetails) return;
    navigate(`/project/${projectId}/experiments?model=${modelId}`);
  };

  return (
    <Card className="border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/15">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <CardTitle className="text-sm font-semibold truncate">
              Model saved: {modelName}
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn('shrink-0 text-[10px] capitalize', toneClass)}
          >
            {taskType}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{modelType}</span>
          {sizeLabel && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>{sizeLabel}</span>
            </>
          )}
        </div>

        {primaryMetrics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {primaryMetrics.map(({ key, value }) => (
              <Badge
                key={key}
                variant="secondary"
                className="text-[10px] font-mono gap-1"
              >
                {key}: {formatMetricValue(value)}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end pt-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span wrapper so Tooltip can show on a disabled button */}
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canOpenDetails}
                    onClick={handleOpen}
                    className="gap-1.5"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open in Experiments
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </span>
              </TooltipTrigger>
              {disabledReason && (
                <TooltipContent className="max-w-[260px] text-[11px]">
                  {disabledReason}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

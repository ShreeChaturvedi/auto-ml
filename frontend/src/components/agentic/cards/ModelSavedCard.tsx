/**
 * ModelSavedCard — surfaced when `register_model` succeeds in the
 * training chat. Bridges to the Experiments module's rich detail panel
 * via an "Open in Experiments" CTA.
 *
 * Task type is conveyed by a class-tinted `StatusPill` (neutral tone with
 * a className override) so `StatusPill`'s tone union doesn't grow for
 * classification / regression / clustering identity.
 *
 * Clustering models skip the Experiments evaluation pipeline entirely
 * (see `evaluationService.ts:377-379`), so the CTA is disabled for
 * them with an explanatory tooltip.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, ExternalLink, Target, TrendingUp, Shapes } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ToolCardShell } from '@/components/llm/shared/ToolCardShell';
import { StatusPill } from '@/components/llm/shared/StatusPill';

export interface ModelSavedCardProps {
  projectId: string;
  modelId: string | undefined;
  modelName: string;
  modelType: string;
  taskType: 'classification' | 'regression' | 'clustering' | string;
  metrics: Record<string, number> | undefined;
  artifactSize?: number;
}

const TASK_ICON: Record<string, LucideIcon> = {
  classification: Target,
  regression: TrendingUp,
  clustering: Shapes,
};

const TASK_TINT: Record<string, string> = {
  classification: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  regression: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  clustering: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

function formatBytes(size: number | undefined): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns the top-N metrics as {key, value} pairs, ordered by the task-type
 * convention so the primary metric sits on the left.
 */
function prioritizeMetrics(
  metrics: Record<string, number> | undefined,
  taskType: string,
): Array<{ key: string; value: number }> {
  if (!metrics) return [];
  const entries = Object.entries(metrics).filter(
    ([, v]) => typeof v === 'number' && Number.isFinite(v),
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
  artifactSize,
}: ModelSavedCardProps) {
  const navigate = useNavigate();
  const primaryMetrics = prioritizeMetrics(metrics, taskType);
  const sizeLabel = formatBytes(artifactSize);
  const TaskIcon = TASK_ICON[taskType] ?? Target;
  const taskTint = TASK_TINT[taskType] ?? 'border-border/70 bg-muted/30 text-muted-foreground';

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

  // Task-type pill uses `StatusPill status="neutral"` with a class override
  // so we get the shared pill chrome without growing StatusPill's tone
  // union by N task-specific colours.
  const taskPill = (
    <StatusPill
      status="neutral"
      icon={TaskIcon}
      label={taskType}
      className={`${taskTint} capitalize`}
    />
  );

  return (
    <ToolCardShell
      icon={BadgeCheck}
      iconClassName="text-metric-positive"
      title="Model saved"
      subtitle={modelName}
      actions={taskPill}
    >
      <div className="space-y-3 px-3 py-2">
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
              // Pill renders `{children}` as a single text node, so the
              // `ModelSavedCard.test.tsx` regex matcher (`/rmse: 0\.4321/`)
              // still hits. The pill is font-mono — the key is an identifier
              // (rmse/auc/etc.), so mono is appropriate — a documented
              // exception to the "no mono outside pills" rule.
              <Pill
                key={key}
                shape="pill"
                size="xs"
                tone="info"
                className="font-mono"
              >
                {`${key}: ${formatMetricValue(value)}`}
              </Pill>
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
      </div>
    </ToolCardShell>
  );
}

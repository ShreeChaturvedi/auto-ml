import { ArrowRight, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type { TransformationEvent } from '@/types/preprocessing';
import { STATUS_DOT_COLOR, STATUS_LABELS, getRowCountSummary, stepTypeIcon } from './preprocessingTabUtils';

const TOOL_HUMAN_LABELS: Record<string, string> = {
  propose_transformation_step: 'Propose step',
  materialize_step_code: 'Materialize code',
  execute_transformation_step: 'Execute step',
  validate_step_result: 'Validate result',
  commit_transformation_step: 'Commit step',
  detect_step_divergence: 'Detect divergence',
  reconcile_diverged_step: 'Reconcile step'
};

interface PreprocessingToolCardProps {
  call: ToolCall;
  result?: ToolResult;
  sortedTimeline: TransformationEvent[];
  onOpenTimeline: () => void;
}

function extractStepId(call: ToolCall, result?: ToolResult): string | undefined {
  const fromArgs = call.args as Record<string, unknown> | undefined;
  if (fromArgs?.stepId && typeof fromArgs.stepId === 'string') {
    return fromArgs.stepId;
  }
  const fromResult = result?.output as Record<string, unknown> | undefined;
  if (fromResult?.stepId && typeof fromResult.stepId === 'string') {
    return fromResult.stepId;
  }
  return undefined;
}

export function PreprocessingToolCard({
  call,
  result,
  sortedTimeline,
  onOpenTimeline
}: PreprocessingToolCardProps) {
  const stepId = extractStepId(call, result);
  const matchedEvent = stepId
    ? sortedTimeline.find((e) => e.stepId === stepId)
    : undefined;

  if (matchedEvent) {
    const Icon = stepTypeIcon(matchedEvent.intentType);
    const rowCountSummary =
      matchedEvent.status === 'applied' ? getRowCountSummary(matchedEvent) : null;
    const isAwaiting = matchedEvent.status === 'awaiting_approval';

    return (
      <button
        type="button"
        className={cn(
          'w-full rounded-md border px-3 py-2 text-left cursor-pointer transition-colors hover:bg-muted/30',
          isAwaiting && 'border-amber-300 dark:border-amber-500/40'
        )}
        onClick={onOpenTimeline}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {matchedEvent.title}
          </span>
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              STATUS_DOT_COLOR[matchedEvent.status],
              (matchedEvent.status === 'running' || isAwaiting) &&
                'timeline-dot-pulse'
            )}
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {STATUS_LABELS[matchedEvent.status]}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        {matchedEvent.rationale ? (
          <p className="mt-1 truncate text-xs text-muted-foreground pl-6">
            {matchedEvent.rationale}
          </p>
        ) : null}
        {rowCountSummary ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground pl-6">
            <span>Rows {rowCountSummary.before}</span>
            <ArrowRight className="h-3 w-3" />
            <span>{rowCountSummary.after}</span>
          </p>
        ) : null}
      </button>
    );
  }

  // Fallback — no matched event
  const humanLabel = TOOL_HUMAN_LABELS[call.tool] ?? call.tool;

  return (
    <button
      type="button"
      className="w-full rounded-md border px-3 py-2 text-left cursor-pointer transition-colors hover:bg-muted/30"
      onClick={onOpenTimeline}
    >
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm">{humanLabel}</span>
        {!result && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </button>
  );
}

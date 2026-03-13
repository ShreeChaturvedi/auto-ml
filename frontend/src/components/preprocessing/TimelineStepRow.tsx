import { useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, ShieldAlert, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TransformationEvent } from '@/types/preprocessing';
import { getRowCountSummary, statusClassName, stepTypeIcon, summarizeValidation } from './preprocessingTabUtils';

const STATUS_LABELS: Record<TransformationEvent['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  awaiting_approval: 'Awaiting approval',
  applied: 'Applied',
  failed: 'Failed',
  diverged: 'Diverged'
};

const STATUS_DOT_COLOR: Record<TransformationEvent['status'], string> = {
  applied: 'bg-emerald-500',
  failed: 'bg-red-500',
  awaiting_approval: 'bg-amber-500',
  running: 'bg-sky-500',
  diverged: 'bg-violet-500',
  pending: 'bg-muted-foreground/40'
};

interface TimelineStepRowProps {
  event: TransformationEvent;
  divergedAccentClassName: string;
  isLast: boolean;
  onApproveStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
}

export function TimelineStepRow({
  event,
  divergedAccentClassName,
  isLast,
  onApproveStep,
  onRejectStep
}: TimelineStepRowProps) {
  const [expanded, setExpanded] = useState(false);

  const Icon = stepTypeIcon(event.intentType);
  const rowCountSummary = getRowCountSummary(event);
  const validationSummary = summarizeValidation(event);
  const hasValidationContent = Boolean(rowCountSummary || validationSummary);
  const isPulsing = event.status === 'running' || event.status === 'awaiting_approval';

  return (
    <div className="timeline-step-enter relative">
      {/* Vertical connecting line */}
      {!isLast && (
        <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-border" />
      )}

      {/* Collapsed row — always visible */}
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Step-type icon */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Status dot */}
        <div
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            STATUS_DOT_COLOR[event.status],
            isPulsing && 'timeline-dot-pulse'
          )}
        />

        {/* Title */}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            event.status === 'running' && 'shimmer-text'
          )}
        >
          {event.title}
        </span>

        {/* Status badge */}
        <Badge
          className={cn(
            'shrink-0 border text-[10px] px-1.5 py-0',
            statusClassName(event.status, divergedAccentClassName)
          )}
        >
          {STATUS_LABELS[event.status]}
        </Badge>

        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {/* Expanded content — animated grid-rows transition */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 py-2 pl-12 pr-2 text-xs">
            {/* Rationale */}
            {event.rationale ? (
              <p className="text-muted-foreground">{event.rationale}</p>
            ) : null}

            {/* Validation metrics */}
            {hasValidationContent ? (
              <div className="rounded-md border bg-muted/20 p-2">
                <p className="font-medium">Validation</p>
                {rowCountSummary ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
                    <span>Rows {rowCountSummary.before}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    <span>{rowCountSummary.after}</span>
                    {rowCountSummary.schemaDrift ? (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        Schema drift
                      </Badge>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{validationSummary}</p>
                )}
              </div>
            ) : null}

            {/* Code reference */}
            {event.code ? (
              <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                <p className="font-medium">Execution location</p>
                <p className="text-muted-foreground">
                  Code is executed and inspectable in the notebook pane.
                </p>
                {event.codeHash ? (
                  <p className="font-mono text-[10px] text-muted-foreground">
                    code hash: {event.codeHash.slice(0, 12)}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Notebook bindings */}
            {event.cellIds.length > 0 ? (
              <div className="rounded-md border bg-muted/20 p-2">
                <p className="mb-1 font-medium">Notebook bindings</p>
                <div className="flex flex-wrap gap-1">
                  {event.cellIds.map((cellId) => (
                    <Badge key={cellId} variant="outline" className="h-5 px-2 text-[10px]">
                      {cellId.slice(0, 8)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Approve / Reject buttons */}
            {event.status === 'awaiting_approval' ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-500/40 dark:bg-amber-950/30">
                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-amber-700 dark:text-amber-400">
                  This step requires explicit approval.
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onRejectStep(event.stepId)}>
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => onApproveStep(event.stepId)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Approve
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Divergence warning */}
            {event.status === 'diverged' ? (
              <div className={cn('rounded-md border p-2', divergedAccentClassName)}>
                Notebook content diverged from the stored step code hash. Edit and re-run to
                reconcile.
              </div>
            ) : null}

            {/* Error message */}
            {event.error ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-2 text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-400">
                {event.error}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

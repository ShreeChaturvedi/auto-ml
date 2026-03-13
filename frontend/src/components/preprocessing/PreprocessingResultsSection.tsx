import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Loader2,
  ShieldAlert
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_LABELS, getRowCountSummary, summarizeValidation } from './preprocessingTabUtils';
import type { TransformationEvent } from '@/types/preprocessing';

export interface PreprocessingResultsSectionProps {
  storeError: string | null;
  latestTimelineEvent: TransformationEvent | null;
  divergedAccentClassName: string;
  onOpenTimeline?: () => void;
}

export function PreprocessingResultsSection({
  storeError,
  latestTimelineEvent,
  divergedAccentClassName,
  onOpenTimeline
}: PreprocessingResultsSectionProps) {
  const composerStatusNotice = useMemo(() => {
    if (!storeError && !latestTimelineEvent) {
      return null;
    }

    if (storeError) {
      return (
        <Card className="border-red-300 dark:border-red-500/40 bg-red-50/80 dark:bg-red-950/30">
          <CardContent className="flex items-center gap-2 p-2 text-xs text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Latest error:</span>
            <span>{storeError}</span>
          </CardContent>
        </Card>
      );
    }

    if (!latestTimelineEvent) {
      return null;
    }

    const status = latestTimelineEvent.status;
    const rowCountSummary = getRowCountSummary(latestTimelineEvent);
    const hasRowCountSummary = Boolean(
      rowCountSummary && !latestTimelineEvent.error && !latestTimelineEvent.decisionReason
    );
    const baseClass = status === 'failed'
      ? 'border-red-300 dark:border-red-500/40 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-400'
      : status === 'awaiting_approval'
        ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400'
        : status === 'diverged'
          ? divergedAccentClassName
          : status === 'applied'
            ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
            : 'border-sky-300 dark:border-sky-500/40 bg-sky-50/80 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400';
    const detail = latestTimelineEvent.error
      ?? latestTimelineEvent.decisionReason
      ?? summarizeValidation(latestTimelineEvent)
      ?? (status === 'awaiting_approval' ? 'Waiting for your approve/reject decision.' : undefined);

    const isClickable = Boolean(onOpenTimeline);

    return (
      <Card
        className={cn(baseClass, isClickable && 'cursor-pointer hover:brightness-105 transition')}
        onClick={isClickable ? onOpenTimeline : undefined}
      >
        <CardContent className="flex items-center gap-2 p-2 text-xs">
          {status === 'failed' ? (
            <AlertTriangle className="h-4 w-4" />
          ) : status === 'awaiting_approval' ? (
            <ShieldAlert className="h-4 w-4" />
          ) : status === 'applied' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{latestTimelineEvent.title}</span>
          <Badge
            variant="outline"
            className="h-5 border-current/30 bg-background/20 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-current"
          >
            {STATUS_LABELS[status]}
          </Badge>
          {hasRowCountSummary && rowCountSummary ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] opacity-95">
              <span className="opacity-80">Rows</span>
              <span className="inline-flex h-5 items-center rounded border border-current/30 bg-background/20 px-1.5 font-medium tabular-nums">
                {rowCountSummary.before}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span className="inline-flex h-5 items-center rounded border border-current/30 bg-background/20 px-1.5 font-medium tabular-nums">
                {rowCountSummary.after}
              </span>
              {rowCountSummary.schemaDrift ? (
                <Badge variant="outline" className="h-5 border-current/30 bg-background/20 px-1.5 text-[10px] text-current">
                  Schema drift
                </Badge>
              ) : null}
            </span>
          ) : null}
          {!hasRowCountSummary && detail ? <span className="text-[11px] opacity-90">{detail}</span> : null}
          {isClickable && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        </CardContent>
      </Card>
    );
  }, [divergedAccentClassName, latestTimelineEvent, onOpenTimeline, storeError]);

  if (!composerStatusNotice) return null;

  return (
    <div className="border-b px-4 py-2">
      <div className="mx-auto w-full max-w-5xl">
        {composerStatusNotice}
      </div>
    </div>
  );
}

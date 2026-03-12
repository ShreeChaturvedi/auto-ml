import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldAlert
} from 'lucide-react';
import { getRowCountSummary, summarizeValidation } from './preprocessingTabUtils';
import type { TransformationEvent } from '@/types/preprocessing';

const STATUS_LABELS: Record<TransformationEvent['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  awaiting_approval: 'Awaiting approval',
  applied: 'Applied',
  failed: 'Failed',
  diverged: 'Diverged'
};

export interface PreprocessingResultsSectionProps {
  storeError: string | null;
  latestTimelineEvent: TransformationEvent | null;
  divergedAccentClassName: string;
}

export function PreprocessingResultsSection({
  storeError,
  latestTimelineEvent,
  divergedAccentClassName
}: PreprocessingResultsSectionProps) {
  const composerStatusNotice = useMemo(() => {
    if (!storeError && !latestTimelineEvent) {
      return null;
    }

    if (storeError) {
      return (
        <Card className="border-red-300 bg-red-50/80">
          <CardContent className="flex items-center gap-2 p-2 text-xs text-red-700">
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
      ? 'border-red-300 bg-red-50/80 text-red-700'
      : status === 'awaiting_approval'
        ? 'border-amber-300 bg-amber-50/80 text-amber-700'
        : status === 'diverged'
          ? divergedAccentClassName
          : status === 'applied'
            ? 'border-emerald-300 bg-emerald-50/80 text-emerald-700'
            : 'border-sky-300 bg-sky-50/80 text-sky-700';
    const detail = latestTimelineEvent.error
      ?? latestTimelineEvent.decisionReason
      ?? summarizeValidation(latestTimelineEvent)
      ?? (status === 'awaiting_approval' ? 'Waiting for your approve/reject decision.' : undefined);

    return (
      <Card className={baseClass}>
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
        </CardContent>
      </Card>
    );
  }, [divergedAccentClassName, latestTimelineEvent, storeError]);

  if (!composerStatusNotice) return null;

  return (
    <div className="border-b px-4 py-2">
      <div className="mx-auto w-full max-w-5xl">
        {composerStatusNotice}
      </div>
    </div>
  );
}

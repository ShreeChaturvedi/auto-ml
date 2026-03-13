import { ArrowRight, CheckCircle2, GitBranch, Loader2, ShieldAlert, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';
import type { TransformationEvent } from '@/types/preprocessing';
import { getRowCountSummary, statusClassName, summarizeValidation } from './preprocessingTabUtils';

const STATUS_LABELS: Record<TransformationEvent['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  awaiting_approval: 'Awaiting approval',
  applied: 'Applied',
  failed: 'Failed',
  diverged: 'Diverged'
};

interface TransformationTimelineProps {
  sortedTimeline: TransformationEvent[];
  replayReport: ReplayCompatibilityReport | null;
  divergedAccentClassName: string;
  projectAccentBorderClass: string;
  isGenerating: boolean;
  onApproveStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
}

export function TransformationTimeline({
  sortedTimeline,
  replayReport,
  divergedAccentClassName,
  projectAccentBorderClass,
  isGenerating,
  onApproveStep,
  onRejectStep
}: TransformationTimelineProps) {
  return (
    <>
      {sortedTimeline.length > 0 ? (
        <div className="space-y-3 mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Transformation Timeline</h2>
            <p className="text-xs text-muted-foreground">
              Cards are projected from structured tool events. Notebook remains the execution source of truth.
            </p>
          </div>
          {sortedTimeline.map((event) => {
            const rowCountSummary = getRowCountSummary(event);
            const validationSummary = summarizeValidation(event);
            const hasValidationSummary = Boolean(rowCountSummary || validationSummary);

            return (
              <Card key={event.id} className={cn('border', event.status === 'diverged' ? projectAccentBorderClass : '')}>
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-sm font-semibold">{event.title}</CardTitle>
                      <p className="text-xs text-muted-foreground">{event.toolName} · step {event.stepId.slice(0, 8)}</p>
                    </div>
                    <Badge className={cn('border', statusClassName(event.status, divergedAccentClassName))}>
                      {STATUS_LABELS[event.status]}
                    </Badge>
                  </div>
                  {event.rationale ? <p className="text-xs text-muted-foreground">{event.rationale}</p> : null}
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  {event.code ? (
                    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
                      <p className="font-medium">Execution location</p>
                      <p className="text-muted-foreground">
                        This step&apos;s code is executed and inspectable in the notebook pane on the right.
                      </p>
                      {event.codeHash ? (
                        <p className="font-mono text-[10px] text-muted-foreground">
                          code hash: {event.codeHash.slice(0, 12)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

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

                  {hasValidationSummary ? (
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

                  {event.status === 'awaiting_approval' ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-2">
                      <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-amber-700 dark:text-amber-400">This step requires explicit approval.</span>
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

                  {event.status === 'diverged' ? (
                    <div className={cn('rounded-md border p-2', divergedAccentClassName)}>
                      Notebook content diverged from the stored step code hash. Edit and re-run to reconcile.
                    </div>
                  ) : null}

                  {event.error ? (
                    <div className="rounded-md border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-950/30 p-2 text-red-700 dark:text-red-400">
                      {event.error}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {replayReport ? (
        <Card className={cn(replayReport.compatible ? 'border-emerald-300 dark:border-emerald-500/40' : 'border-amber-300 dark:border-amber-500/40')}>
          <CardContent className="space-y-2 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <GitBranch className="h-4 w-4" />
              Replay compatibility {replayReport.compatible ? 'passed' : 'needs attention'}
            </div>
            {!replayReport.compatible ? (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {replayReport.issues.map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No replay blockers detected against current dataset schema.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isGenerating ? (
        <div className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Streaming preprocessing graph events...
        </div>
      ) : null}
    </>
  );
}

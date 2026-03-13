import { GitBranch } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { ReplayCompatibilityReport } from '@/stores/preprocessingStore';
import type { TransformationEvent } from '@/types/preprocessing';
import { TimelineStepRow } from './TimelineStepRow';

interface TransformationTimelineSheetProps {
  sortedTimeline: TransformationEvent[];
  replayReport: ReplayCompatibilityReport | null;
  divergedAccentClassName: string;
  isGenerating: boolean;
  onApproveStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransformationTimelineSheet(props: TransformationTimelineSheetProps) {
  const {
    sortedTimeline,
    replayReport,
    divergedAccentClassName,
    isGenerating,
    onApproveStep,
    onRejectStep,
    open,
    onOpenChange
  } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] max-w-[90vw] flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base">Transformation Timeline</SheetTitle>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {sortedTimeline.length} steps
            </Badge>
          </div>
          <SheetDescription className="sr-only">
            Step-by-step transformation pipeline
          </SheetDescription>
        </SheetHeader>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">
            {sortedTimeline.length > 0 ? (
              sortedTimeline.map((event, idx) => (
                <TimelineStepRow
                  key={event.id}
                  event={event}
                  divergedAccentClassName={divergedAccentClassName}
                  isLast={idx === sortedTimeline.length - 1}
                  onApproveStep={onApproveStep}
                  onRejectStep={onRejectStep}
                />
              ))
            ) : isGenerating ? (
              <div className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full timeline-skeleton" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded timeline-skeleton" />
                    <div className="h-3 w-1/2 rounded timeline-skeleton" />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">
                No transformation steps yet.
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Footer — replay compatibility report */}
        {replayReport ? (
          <div className="border-t p-4">
            <Card
              className={cn(
                replayReport.compatible
                  ? 'border-emerald-300 dark:border-emerald-500/40'
                  : 'border-amber-300 dark:border-amber-500/40'
              )}
            >
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
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

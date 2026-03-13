import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TransformationEvent } from '@/types/preprocessing';
import { STATUS_DOT_COLOR, stepTypeIcon } from './preprocessingTabUtils';

interface TimelineProgressBarProps {
  sortedTimeline: TransformationEvent[];
  isGenerating: boolean;
  onOpenTimeline: () => void;
}

export function TimelineProgressBar({
  sortedTimeline,
  isGenerating,
  onOpenTimeline
}: TimelineProgressBarProps) {
  if (sortedTimeline.length === 0 && !isGenerating) {
    return null;
  }

  const hasAwaitingApproval = sortedTimeline.some(
    (e) => e.status === 'awaiting_approval'
  );

  let icon: React.ReactNode;
  let text: React.ReactNode;
  let statusDot: React.ReactNode = null;

  if (isGenerating && sortedTimeline.length === 0) {
    icon = <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    text = <span className="shimmer-text text-sm">Analyzing dataset...</span>;
  } else if (isGenerating && sortedTimeline.length > 0) {
    const activeStep =
      sortedTimeline.findLast((e) => e.status === 'running') ??
      sortedTimeline[sortedTimeline.length - 1];
    const activeIndex = sortedTimeline.indexOf(activeStep);
    const Icon = stepTypeIcon(activeStep.intentType);
    icon = <Icon className="h-4 w-4 text-muted-foreground" />;
    text = (
      <span className="text-sm">
        Step {activeIndex + 1}/{sortedTimeline.length} &mdash;{' '}
        <span className="shimmer-text">{activeStep.title}</span>
      </span>
    );
  } else {
    const latestEvent = sortedTimeline.reduce<TransformationEvent | undefined>(
      (best, e) => (!best || e.updatedAt > best.updatedAt ? e : best),
      undefined
    );
    const Icon = stepTypeIcon(latestEvent?.intentType);
    icon = <Icon className="h-4 w-4 text-muted-foreground" />;
    text = (
      <span className="text-sm text-muted-foreground">
        Pipeline: {sortedTimeline.length} steps
      </span>
    );
    statusDot = latestEvent ? (
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          STATUS_DOT_COLOR[latestEvent.status]
        )}
      />
    ) : null;
  }

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 cursor-pointer transition-colors hover:bg-muted/50"
      onClick={onOpenTimeline}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{text}</span>
      {statusDot}
      {hasAwaitingApproval && (
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 timeline-dot-pulse" />
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

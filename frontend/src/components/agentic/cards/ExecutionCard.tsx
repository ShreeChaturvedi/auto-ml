/**
 * ExecutionCard - Displays execution output with status indication.
 *
 * Shows a progress shimmer while running, duration + status badge on complete,
 * and a monospace output area for stdout/stderr.
 *
 * When training progress markers (__TRAIN_START__, __TRAIN_PROGRESS__, __TRAIN_COMPLETE__)
 * are detected in stdout, renders TrainingProgressCard for rich visualization.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDuration } from '@/components/experiments/utils';
import { parseAllTrainingEvents } from '@/lib/training/progressParser';
import type { TrainingEvent } from '@/lib/training/progressParser';
import { TrainingProgressCard, type MetricSeries } from '@/components/training/TrainingProgressCard';
import { isLowerBetterMetric } from '@/components/experiments/modelIcons';

export interface ExecutionCardProps {
  status: 'running' | 'success' | 'failed';
  stdout?: string;
  stderr?: string;
  duration?: number;
}

/** Build metric series from parsed training progress events. */
function buildMetricSeries(events: TrainingEvent[]): MetricSeries[] {
  const progressEvents = events.filter(
    (e): e is TrainingEvent & { type: 'progress' } => e.type === 'progress',
  );
  if (progressEvents.length === 0) return [];

  const allKeys = new Set<string>();
  for (const e of progressEvents) {
    for (const key of Object.keys(e.metrics)) allKeys.add(key);
  }

  return Array.from(allKeys).map((name) => {
    const values = progressEvents.map((e) => e.metrics[name] ?? 0);
    const isLossLike = isLowerBetterMetric(name);
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? 0;
    const improving = isLossLike ? last <= first : last >= first;
    return { name, values, improving };
  });
}

export function ExecutionCard({
  status,
  stdout,
  stderr,
  duration,
}: ExecutionCardProps) {
  const [expanded, setExpanded] = useState(status !== 'success');

  // Parse training progress from stdout
  const trainingData = useMemo(() => {
    if (!stdout) return null;
    const events = parseAllTrainingEvents(stdout);
    const startEvent = events.find(
      (e): e is TrainingEvent & { type: 'start' } => e.type === 'start',
    );
    if (!startEvent) return null;

    const progressEvents = events.filter(
      (e): e is TrainingEvent & { type: 'progress' } => e.type === 'progress',
    );
    const completeEvent = events.find(
      (e): e is TrainingEvent & { type: 'complete' } => e.type === 'complete',
    );
    const lastProgress = progressEvents[progressEvents.length - 1];
    const metrics = buildMetricSeries(events);

    return {
      modelType: startEvent.modelType,
      totalEpochs: startEvent.totalEpochs,
      currentEpoch: lastProgress?.epoch ?? 0,
      metrics,
      isComplete: !!completeEvent,
      finalMetrics: completeEvent?.finalMetrics,
    };
  }, [stdout]);

  // If training progress was detected, render the rich card
  if (trainingData) {
    return (
      <TrainingProgressCard
        status={trainingData.isComplete ? 'complete' : 'running'}
        modelType={trainingData.modelType}
        currentEpoch={trainingData.currentEpoch}
        totalEpochs={trainingData.totalEpochs}
        elapsedSeconds={duration ? duration / 1000 : 0}
        metrics={trainingData.metrics}
        finalMetrics={trainingData.finalMetrics}
      />
    );
  }

  const hasOutput = !!(stdout || stderr);

  return (
    <div className="rounded-md border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => hasOutput && setExpanded(!expanded)}
        disabled={!hasOutput}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
          hasOutput && 'hover:bg-muted/30 cursor-pointer',
          !hasOutput && 'cursor-default',
        )}
      >
        {status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : status === 'success' ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        ) : (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        )}

        <span
          className={cn(
            'flex-1 text-xs font-medium',
            status === 'running' && 'shimmer-text text-muted-foreground',
            status === 'success' && 'text-foreground',
            status === 'failed' && 'text-destructive',
          )}
        >
          {status === 'running' ? 'Executing...' : status === 'success' ? 'Execution succeeded' : 'Execution failed'}
        </span>

        {duration != null && status !== 'running' && (
          <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
            {formatDuration(duration)}
          </span>
        )}

        {status !== 'running' && (
          <Badge
            variant={status === 'success' ? 'secondary' : 'destructive'}
            className="text-[10px]"
          >
            {status}
          </Badge>
        )}

        {hasOutput && (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        )}
      </button>

      {/* Output area */}
      {expanded && hasOutput && (
        <div className="border-t">
          {stdout && (
            <pre className="max-h-[200px] overflow-auto bg-muted/20 p-3 text-[11px] leading-relaxed font-mono text-foreground whitespace-pre-wrap">
              {stdout}
            </pre>
          )}
          {stderr && (
            <pre className="max-h-[150px] overflow-auto border-t border-destructive/20 bg-destructive/5 p-3 text-[11px] leading-relaxed font-mono text-destructive whitespace-pre-wrap">
              {stderr}
            </pre>
          )}
        </div>
      )}

      {/* Running shimmer bar */}
      {status === 'running' && (
        <div className="h-0.5 w-full overflow-hidden bg-muted">
          <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        </div>
      )}
    </div>
  );
}

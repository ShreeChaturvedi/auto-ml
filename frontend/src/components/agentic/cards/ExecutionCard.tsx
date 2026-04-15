/**
 * ExecutionCard — cell / step execution output with status indication.
 *
 * Running state: `Loader2` spinner header, shimmer title, no shimmer bar.
 * Success state: `CheckCircle2` in `text-metric-positive`; on hover the icon
 * fades to a chevron (owned by `ToolCardShell`).
 * Failed state: `XCircle` in `text-metric-negative`, `variant="error"` on
 * the shell — the only card that draws a colored outline besides `ErrorCard`.
 *
 * Duration is mono tabular-nums — a documented exception to the
 * "no mono outside pills" rule: column stability matters more than prose
 * font consistency for running timestamps.
 *
 * If training progress markers are detected in stdout, the card
 * early-returns to `TrainingProgressCard` for a richer visualization.
 */

import { useMemo } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/components/experiments/utils';
import { parseAllTrainingEvents } from '@/lib/training/progressParser';
import type { TrainingEvent } from '@/lib/training/progressParser';
import { TrainingProgressCard, type MetricSeries } from '@/components/training/TrainingProgressCard';
import { isLowerBetterMetric } from '@/components/experiments/modelIcons';
import { ToolCardShell } from '@/components/llm/shared/ToolCardShell';

export interface ExecutionCardProps {
  status: 'running' | 'success' | 'failed';
  stdout?: string;
  stderr?: string;
  duration?: number;
}

/**
 * Single-pass derivation: sorts events into start / progress / complete
 * buckets and builds per-metric series in one walk.
 */
function deriveTrainingData(
  stdout: string | undefined,
  duration: number | undefined,
):
  | null
  | {
      modelType: string;
      currentEpoch: number;
      totalEpochs: number;
      metrics: MetricSeries[];
      isComplete: boolean;
      finalMetrics: Record<string, number> | undefined;
    } {
  if (!stdout) return null;

  const events = parseAllTrainingEvents(stdout);
  let start: (TrainingEvent & { type: 'start' }) | undefined;
  let complete: (TrainingEvent & { type: 'complete' }) | undefined;
  const progress: Array<TrainingEvent & { type: 'progress' }> = [];
  const metricValues = new Map<string, number[]>();

  for (const evt of events) {
    if (evt.type === 'start') start = evt;
    else if (evt.type === 'complete') complete = evt;
    else if (evt.type === 'progress') {
      progress.push(evt);
      for (const [key, value] of Object.entries(evt.metrics)) {
        let series = metricValues.get(key);
        if (!series) {
          series = [];
          metricValues.set(key, series);
        }
        series.push(value);
      }
    }
  }
  if (!start) return null;

  const metrics: MetricSeries[] = Array.from(metricValues, ([name, values]) => {
    const isLossLike = isLowerBetterMetric(name);
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? 0;
    return { name, values, improving: isLossLike ? last <= first : last >= first };
  });

  // Unused for this branch but kept for typing parity.
  void duration;

  return {
    modelType: start.modelType,
    totalEpochs: start.totalEpochs,
    currentEpoch: progress[progress.length - 1]?.epoch ?? 0,
    metrics,
    isComplete: !!complete,
    finalMetrics: complete?.finalMetrics,
  };
}

/** Shared `<pre>` rendering for stdout / stderr blocks. */
function OutputPre({ stream, text }: { stream: 'out' | 'err'; text: string }) {
  return (
    <pre
      className={cn(
        'overflow-auto p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap',
        stream === 'out' && 'max-h-[200px] bg-muted/20 text-foreground',
        stream === 'err' &&
          'max-h-[150px] border-t border-metric-negative/20 bg-metric-negative/5 text-metric-negative',
      )}
    >
      {text}
    </pre>
  );
}

export function ExecutionCard({
  status,
  stdout,
  stderr,
  duration,
}: ExecutionCardProps) {
  const trainingData = useMemo(() => deriveTrainingData(stdout, duration), [stdout, duration]);

  // Training progress → early return to the richer training card.
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

  const hasOutput = !!(stdout || stderr || (status !== 'running' && duration != null));

  const headerIcon = status === 'running' ? Loader2 : status === 'success' ? CheckCircle2 : XCircle;
  const headerIconClass = cn(
    status === 'running' && 'animate-spin text-muted-foreground',
    status === 'success' && 'text-metric-positive',
    status === 'failed' && 'text-metric-negative',
  );

  // The running label drops its "..." in favour of the metallic
  // `shimmer-text` sweep — the ellipsis and the shimmer were saying the
  // same thing. The succeeded / failed strings are still checked verbatim
  // by `useLifecycleCards.test.tsx` at lines 50 + 77, so they must not
  // change.
  const title =
    status === 'running' ? 'Executing'
      : status === 'success' ? 'Execution succeeded'
        : 'Execution failed';

  const titleClass = cn(
    status === 'running' && 'shimmer-text text-muted-foreground',
    status === 'failed' && 'text-metric-negative',
  );

  const durationBadge = duration != null && status !== 'running' ? (
    <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">
      {formatDuration(duration)}
    </span>
  ) : null;

  const pillStatus = status === 'success' ? 'success' : status === 'failed' ? 'failed' : undefined;

  return (
    <ToolCardShell
      icon={headerIcon}
      iconClassName={headerIconClass}
      title={<span className={titleClass}>{title}</span>}
      actions={durationBadge}
      status={pillStatus}
      variant={status === 'failed' ? 'error' : 'default'}
      expandable={hasOutput}
      defaultExpanded={status !== 'success'}
    >
      {hasOutput && (
        <>
          {stdout && <OutputPre stream="out" text={stdout} />}
          {stderr && <OutputPre stream="err" text={stderr} />}
          {!stdout && !stderr && duration != null && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Completed in {formatDuration(duration)} with no console output.
            </div>
          )}
        </>
      )}
    </ToolCardShell>
  );
}

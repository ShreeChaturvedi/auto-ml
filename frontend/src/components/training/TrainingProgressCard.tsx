/**
 * TrainingProgressCard — Rich training progress visualization.
 *
 * Renders a progress bar, elapsed timer, per-metric sparklines, and
 * color-coded badges when training progress markers are detected.
 */

import { useMemo } from 'react';
import {
  LineChart, Line, ResponsiveContainer, YAxis,
} from 'recharts';
import { Activity, CheckCircle2, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

export interface MetricSeries {
  name: string;
  values: number[];
  improving: boolean;
}

export interface TrainingProgressCardProps {
  status: 'running' | 'complete';
  modelType: string;
  currentEpoch: number;
  totalEpochs: number;
  elapsedSeconds: number;
  metrics: MetricSeries[];
  finalMetrics?: Record<string, number>;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function formatMetricValue(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

function formatMetricName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Tiny sparkline for a single metric series. */
function MetricSparkline({ series }: { series: MetricSeries }) {
  const data = useMemo(
    () => series.values.map((v, i) => ({ epoch: i + 1, value: v })),
    [series.values],
  );
  const lastValue = series.values[series.values.length - 1] ?? 0;
  const color = series.improving ? '#22c55e' : '#ef4444';

  return (
    <div className="flex items-center gap-2.5 rounded-md border bg-muted/30 px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-[10px] font-medium text-muted-foreground truncate">
            {formatMetricName(series.name)}
          </span>
          <span
            className={cn(
              'text-xs font-mono font-semibold tabular-nums',
              series.improving ? 'text-emerald-500' : 'text-red-400',
            )}
          >
            {formatMetricValue(lastValue)}
          </span>
        </div>
        {data.length > 1 && (
          <div className="h-6 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <YAxis domain={['dataMin', 'dataMax']} hide />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export function TrainingProgressCard({
  status,
  modelType,
  currentEpoch,
  totalEpochs,
  elapsedSeconds,
  metrics,
  finalMetrics,
}: TrainingProgressCardProps) {
  const pct = totalEpochs > 0 ? Math.round((currentEpoch / totalEpochs) * 100) : 0;
  const isRunning = status === 'running';

  return (
    <div
      className={cn(
        'rounded-lg border shadow-sm overflow-hidden',
        isRunning ? 'border-primary/30 bg-card' : 'border-emerald-500/30 bg-card',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        {isRunning ? (
          <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        )}
        <span className={cn('text-xs font-medium', isRunning && 'shimmer-text')}>
          {isRunning ? 'Training in progress' : 'Training complete'}
        </span>
        <Badge variant="outline" className="ml-auto text-[10px] font-mono">
          {modelType}
        </Badge>
      </div>

      {/* Progress section */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Epoch + time row */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-mono tabular-nums text-foreground">
            Epoch {currentEpoch}/{totalEpochs}
          </span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Timer className="h-3 w-3" />
            <span className="font-mono tabular-nums">{formatElapsed(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <Progress
          value={pct}
          className="h-1.5"
          indicatorClassName={isRunning ? 'bg-primary' : 'bg-emerald-500'}
        />

        {/* Percentage */}
        <div className="text-right text-[10px] font-mono tabular-nums text-muted-foreground">
          {pct}%
        </div>
      </div>

      {/* Metric sparklines */}
      {metrics.length > 0 && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
          {metrics.map((s) => (
            <MetricSparkline key={s.name} series={s} />
          ))}
        </div>
      )}

      {/* Final metrics summary (on complete) */}
      {finalMetrics && Object.keys(finalMetrics).length > 0 && (
        <div className="border-t px-3 py-2">
          <div className="flex flex-wrap gap-2">
            {Object.entries(finalMetrics).map(([key, value]) => (
              <Badge
                key={key}
                variant="secondary"
                className="text-[10px] font-mono gap-1"
              >
                {formatMetricName(key)}: {formatMetricValue(value)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Running shimmer bar */}
      {isRunning && (
        <div className="h-0.5 w-full overflow-hidden bg-muted">
          <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        </div>
      )}
    </div>
  );
}

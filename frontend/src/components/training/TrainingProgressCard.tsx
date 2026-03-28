/**
 * TrainingProgressCard — Live training progress visualization.
 *
 * Shows progress bar, elapsed time, metric sparklines, and status.
 * Uses project theme color for progress fill and sparkline strokes.
 */

import { useMemo } from 'react';
import { CheckCircle2, Loader2, Timer } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';

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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Sparkline({ values, improving, themeHex }: { values: number[]; improving: boolean; themeHex?: string }) {
  const data = useMemo(
    () => values.map((v, i) => ({ i, v })),
    [values],
  );

  if (data.length < 2) return null;

  const stroke = improving
    ? (themeHex ?? 'hsl(155, 60%, 55%)')
    : 'hsl(0, 70%, 60%)';

  return (
    <div className="h-[52px] w-[110px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
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
  const { themeColor, colorClasses } = useProjectThemeColor();
  const progressPercent = totalEpochs > 0 ? Math.round((currentEpoch / totalEpochs) * 100) : 0;
  const isRunning = status === 'running';

  return (
    <div className={cn(
      'rounded-lg border border-border bg-card text-card-foreground overflow-hidden',
      isRunning && 'shadow-sm dark:shadow-none',
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/40">
        {isRunning ? (
          <Loader2 className={cn('h-3.5 w-3.5 shrink-0 animate-spin', colorClasses?.text ?? 'text-primary')} />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        )}
        <span className="text-xs font-medium text-foreground flex-1">
          {isRunning ? 'Training in progress' : 'Training complete'}
        </span>
        <Badge variant="outline" className="text-[10px] font-mono">
          {modelType}
        </Badge>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground tabular-nums">
          <Timer className="h-3 w-3" />
          {formatTime(elapsedSeconds)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-3.5 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Epoch {currentEpoch} / {totalEpochs}</span>
          <span className="tabular-nums">{progressPercent}%</span>
        </div>
        <Progress
          value={progressPercent}
          className="h-1.5"
          indicatorClassName={colorClasses?.fill}
          indicatorStyle={themeColor && !colorClasses?.fill ? { backgroundColor: themeColor } : undefined}
        />
      </div>

      {/* Metrics sparklines */}
      {metrics.length > 0 && (
        <div className="px-3.5 pb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {metrics.map((m) => {
            const latest = m.values[m.values.length - 1];
            return (
              <div key={m.name} className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground truncate">{m.name}</span>
                  {latest != null && (
                    <span
                      className={cn(
                        'text-[10px] font-mono tabular-nums font-medium',
                        m.improving ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                      )}
                    >
                      {latest.toFixed(4)}
                    </span>
                  )}
                </div>
                <Sparkline
                  values={m.values}
                  improving={m.improving}
                  themeHex={themeColor}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Final metrics summary */}
      {status === 'complete' && finalMetrics && Object.keys(finalMetrics).length > 0 && (
        <div className="px-3.5 pb-3 flex flex-wrap gap-1.5">
          {Object.entries(finalMetrics).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="text-[10px] font-mono gap-1">
              {key}: {typeof value === 'number' ? value.toFixed(4) : value}
            </Badge>
          ))}
        </div>
      )}

      {/* Running shimmer bar */}
      {isRunning && (
        <div className="h-0.5 w-full overflow-hidden">
          <div
            className="h-full w-full timeline-skeleton"
            style={themeColor ? {
              background: `linear-gradient(90deg, hsl(var(--muted)) 25%, ${themeColor}40 50%, hsl(var(--muted)) 75%)`,
              backgroundSize: '200% 100%',
            } : undefined}
          />
        </div>
      )}
    </div>
  );
}

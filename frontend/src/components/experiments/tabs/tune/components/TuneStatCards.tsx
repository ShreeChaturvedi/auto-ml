import { Trophy, TrendingUp, Clock, Search, Target, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TuneStatCardsProps {
  mode: 'discovery' | 'insight';
  bestValue: number | null;
  prevBestValue?: number | null;
  improvementDelta: number | null;
  nComplete: number;
  nTotal: number;
  startedAt: number | null;
  convergenceStatus?: string | null;
  metric?: string;
}

const formatValue = (v: number | null): string => {
  if (v == null || !Number.isFinite(v)) return '\u2014';
  return Math.abs(v) >= 1 ? v.toFixed(4) : v.toFixed(6);
};

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '\u2014';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

const CONVERGENCE_DISPLAY: Record<string, { Icon: typeof Search; color: string; label: string }> = {
  exploring: { Icon: Search, color: 'text-blue-500', label: 'Exploring' },
  narrowing: { Icon: Target, color: 'text-amber-500', label: 'Narrowing' },
  converging: { Icon: TrendingUp, color: 'text-emerald-500', label: 'Converging' },
};

export function TuneStatCards({
  mode,
  bestValue,
  prevBestValue,
  improvementDelta,
  nComplete,
  nTotal,
  startedAt,
  convergenceStatus,
}: TuneStatCardsProps) {
  const bestImproved = prevBestValue != null && bestValue != null && bestValue !== prevBestValue;

  // ETA in discovery, total duration in insight
  const timeDisplay = (() => {
    if (!startedAt) return '\u2014';
    const elapsed = Date.now() - startedAt;
    if (mode === 'insight') return formatTime(elapsed);
    if (nComplete < 1) return '\u2014';
    const eta = (elapsed / nComplete) * (nTotal - nComplete);
    return formatTime(eta);
  })();

  // Status card content
  const statusContent = (() => {
    if (mode === 'insight') {
      return { Icon: CheckCircle, color: 'text-emerald-500', label: 'Complete' };
    }
    return CONVERGENCE_DISPLAY[convergenceStatus ?? ''] ?? { Icon: Search, color: 'text-muted-foreground', label: 'Running' };
  })();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* Best Score */}
      <div className={cn('bg-muted/40 border border-border/30 rounded-lg p-3 space-y-1', bestImproved && 'trial-best-pulse')}>
        <div className="flex items-center gap-1.5">
          <Trophy className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Best Score</span>
        </div>
        <p className="text-lg font-bold font-mono tabular-nums">{formatValue(bestValue)}</p>
      </div>

      {/* Improvement */}
      <div className="bg-muted/40 border border-border/30 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Improvement</span>
        </div>
        <p className={cn(
          'text-lg font-bold font-mono tabular-nums',
          improvementDelta != null && improvementDelta > 0
            ? 'text-emerald-500'
            : improvementDelta != null && improvementDelta < 0
              ? 'text-red-500/70'
              : 'text-muted-foreground',
        )}>
          {improvementDelta != null ? `${improvementDelta > 0 ? '+' : ''}${formatValue(improvementDelta)}` : '\u2014'}
        </p>
      </div>

      {/* ETA / Duration */}
      <div className="bg-muted/40 border border-border/30 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {mode === 'discovery' ? 'ETA' : 'Duration'}
          </span>
        </div>
        <p className="text-lg font-bold font-mono tabular-nums">{timeDisplay}</p>
      </div>

      {/* Status */}
      <div className="bg-muted/40 border border-border/30 rounded-lg p-3 space-y-1">
        <div className="flex items-center gap-1.5">
          <statusContent.Icon className={cn('h-3 w-3', statusContent.color)} />
          <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Status</span>
        </div>
        <p className={cn('text-lg font-bold', statusContent.color)}>{statusContent.label}</p>
      </div>
    </div>
  );
}

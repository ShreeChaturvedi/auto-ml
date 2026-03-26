import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { OptimizationHistoryChart } from '@/components/experiments/charts/OptimizationHistoryChart';
import type { TuningTrialEvent } from '@/types/experiments';
import { TuneStatCards } from '../components/TuneStatCards';
import { ParamImportanceChart } from '../charts/ParamImportanceChart';

interface DiscoveryPhaseProps {
  metric: string;
  budget: string;
  trials: TuningTrialEvent[];
  bestValue: number | null;
  prevBestValue: number | null;
  improvementDelta: number | null;
  nComplete: number;
  nTotal: number;
  progressPercent: number;
  startedAt: number | null;
  importances: Record<string, number> | null;
  convergenceStatus: string | null;
  direction: 'maximize' | 'minimize';
  onCancel: () => void;
}

export function DiscoveryPhase({
  metric,
  budget,
  trials,
  bestValue,
  prevBestValue,
  improvementDelta,
  nComplete,
  nTotal,
  progressPercent,
  startedAt,
  importances,
  convergenceStatus,
  direction,
  onCancel,
}: DiscoveryPhaseProps) {
  const { colorClasses } = useProjectThemeColor();

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">{metric}</Badge>
        <Badge variant="outline" className="text-xs capitalize border-border/30">{budget}</Badge>
        <Badge variant="outline" className="text-xs font-mono tabular-nums">{nComplete}/{nTotal}</Badge>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-400/10">
            <Square className="h-3 w-3" />
            Stop
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-muted-foreground">Progress</span>
          <span className="text-xs text-muted-foreground font-mono tabular-nums">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <Progress
          value={progressPercent}
          className="h-2.5"
          indicatorClassName={colorClasses?.fill}
        />
      </div>

      {/* Stat cards */}
      <TuneStatCards
        mode="discovery"
        bestValue={bestValue}
        prevBestValue={prevBestValue}
        improvementDelta={improvementDelta}
        nComplete={nComplete}
        nTotal={nTotal}
        startedAt={startedAt}
        convergenceStatus={convergenceStatus}
        metric={metric}
      />

      {/* Chart */}
      <OptimizationHistoryChart trials={trials} height={280} direction={direction} />

      {/* Importance */}
      <ParamImportanceChart data={importances} />
    </div>
  );
}

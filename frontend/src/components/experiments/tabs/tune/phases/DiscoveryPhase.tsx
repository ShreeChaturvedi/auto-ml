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
  nTrials: number;
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
        <Badge variant="secondary" className="text-xs">{metric}</Badge>
        <Badge variant="outline" className="text-xs capitalize">{budget}</Badge>
        <Badge variant="outline" className="text-xs font-mono tabular-nums">{nComplete}/{nTotal}</Badge>
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5 text-xs">
            <Square className="h-3 w-3" />
            Stop
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <Progress
          value={progressPercent}
          className="h-2.5"
          indicatorClassName={colorClasses?.fill}
        />
        <p className="text-xs text-muted-foreground font-mono tabular-nums text-right">
          {Math.round(progressPercent)}%
        </p>
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

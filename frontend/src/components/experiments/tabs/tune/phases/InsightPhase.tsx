import { ExternalLink, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OptimizationHistoryChart } from '@/components/experiments/charts/OptimizationHistoryChart';
import type { TuningTrialEvent } from '@/types/experiments';
import { TuneStatCards } from '../components/TuneStatCards';
import { ParamImportanceChart } from '../charts/ParamImportanceChart';
import { ParamComparisonTable } from '../components/ParamComparisonTable';

interface InsightPhaseProps {
  metric: string;
  trials: TuningTrialEvent[];
  bestValue: number | null;
  bestParams: Record<string, unknown> | null;
  improvementDelta: number | null;
  nComplete: number;
  nTotal: number;
  startedAt: number | null;
  importances: Record<string, number> | null;
  resultModelId: string | null;
  sourceParams: Record<string, unknown>;
  direction: 'maximize' | 'minimize';
  onViewTunedModel: () => void;
  onTuneAgain: () => void;
}

export function InsightPhase({
  metric,
  trials,
  bestValue,
  bestParams,
  improvementDelta,
  nComplete,
  nTotal,
  startedAt,
  importances,
  resultModelId,
  sourceParams,
  direction,
  onViewTunedModel,
  onTuneAgain,
}: InsightPhaseProps) {
  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <TuneStatCards
        mode="insight"
        bestValue={bestValue}
        improvementDelta={improvementDelta}
        nComplete={nComplete}
        nTotal={nTotal}
        startedAt={startedAt}
        metric={metric}
      />

      {/* Chart */}
      <OptimizationHistoryChart trials={trials} height={280} direction={direction} />

      {/* Importance */}
      <ParamImportanceChart data={importances} />

      {/* Param comparison */}
      {bestParams && Object.keys(bestParams).length > 0 && (
        <ParamComparisonTable sourceParams={sourceParams} tunedParams={bestParams} />
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          {resultModelId && (
            <Button onClick={onViewTunedModel} size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              View Tuned Model
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onTuneAgain} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Tune Again
        </Button>
      </div>
    </div>
  );
}

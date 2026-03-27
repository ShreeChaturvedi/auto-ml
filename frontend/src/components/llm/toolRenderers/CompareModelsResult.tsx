import { cn } from '@/lib/utils';
import { asRecord, asString, asNumber } from '@/lib/typeCoercion';
import { Badge } from '@/components/ui/badge';
import { Trophy, AlertTriangle, Crown } from 'lucide-react';
import { DetailGrid, StatusBadge, type DetailField } from './sharedComponents';

interface ModelComparison {
  rank: number;
  experimentName: string;
  modelType: string;
  primaryMetricValue: number;
  status: string;
}

export interface CompareModelsOutput {
  primaryMetric: string;
  comparison: ModelComparison[];
  missingExperiments: string[];
  bestExperiment: string;
}

const RANK_DOT_COLORS: Record<number, string> = {
  1: 'bg-amber-400',
  2: 'bg-zinc-400',
  3: 'bg-amber-700 dark:bg-amber-600',
};

function RankCell({ rank }: { rank: number }) {
  const dotColor = RANK_DOT_COLORS[rank];

  return (
    <span className="flex items-center gap-1.5">
      {dotColor
        ? <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
        : <span className="h-1.5 w-1.5" />}
      <span className="text-muted-foreground">#{rank}</span>
    </span>
  );
}

function parseComparison(raw: unknown): ModelComparison[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const r = asRecord(item);
    return {
      rank: asNumber(r.rank) ?? 0,
      experimentName: asString(r.experimentName) ?? 'Unknown',
      modelType: asString(r.modelType) ?? '—',
      primaryMetricValue: asNumber(r.primaryMetricValue) ?? 0,
      status: asString(r.status) ?? 'unknown',
    };
  });
}

export function CompareModelsResult({ output }: { output: unknown }) {
  const out = asRecord(output);
  const primaryMetric = asString(out.primaryMetric) ?? 'metric';
  const comparison = parseComparison(out.comparison);
  const missingExperiments = Array.isArray(out.missingExperiments)
    ? (out.missingExperiments as string[]).filter((s) => typeof s === 'string')
    : [];
  const bestExperiment = asString(out.bestExperiment);

  if (comparison.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No experiments evaluated yet.</p>;
  }

  if (comparison.length === 1) {
    const model = comparison[0];
    const fields: DetailField[] = [
      { label: 'Type', value: model.modelType },
      { label: primaryMetric, value: model.primaryMetricValue.toFixed(4), mono: true },
    ];
    return (
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-foreground font-medium">
          <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
          {model.experimentName}
        </div>
        <DetailGrid fields={fields} />
        <StatusBadge status={model.status} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs">
        <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground">Model comparison</span>
        <Badge variant="outline" className="text-[10px] font-mono ml-auto">
          {primaryMetric}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              <th className="text-left py-1 pr-3 font-medium">Rank</th>
              <th className="text-left py-1 pr-3 font-medium">Experiment</th>
              <th className="text-left py-1 pr-3 font-medium">Type</th>
              <th className="text-right py-1 pr-3 font-medium">{primaryMetric}</th>
              <th className="text-left py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((model) => {
              const isBest = model.experimentName === bestExperiment;
              return (
                <tr
                  key={model.rank}
                  className={cn(
                    'border-b border-border/20 last:border-0',
                    isBest && 'bg-emerald-500/5',
                  )}
                >
                  <td className="py-1.5 pr-3">
                    <RankCell rank={model.rank} />
                  </td>
                  <td className="py-1.5 pr-3 text-foreground font-medium">
                    <span className="flex items-center gap-1.5">
                      {model.experimentName}
                      {isBest && <Crown className="h-3 w-3 text-amber-500" />}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{model.modelType}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-foreground">
                    {model.primaryMetricValue.toFixed(4)}
                  </td>
                  <td className="py-1.5">
                    <StatusBadge status={model.status} className="px-1.5 py-0" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {missingExperiments.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>Missing: {missingExperiments.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

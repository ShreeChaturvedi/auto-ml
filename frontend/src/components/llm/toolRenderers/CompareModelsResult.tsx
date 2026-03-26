import { cn } from '@/lib/utils';
import { asRecord, asString, asNumber } from '@/lib/typeCoercion';
import { Badge } from '@/components/ui/badge';

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

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
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
    return <p className="text-xs text-muted-foreground italic">No experiments have been evaluated yet.</p>;
  }

  // Single model: render as simple metric card
  if (comparison.length === 1) {
    const model = comparison[0];
    return (
      <div className="space-y-1 text-xs">
        <p className="font-medium text-foreground">{model.experimentName}</p>
        <p className="text-muted-foreground">
          {model.modelType} · {primaryMetric}:{' '}
          <span className="font-mono tabular-nums">{model.primaryMetricValue.toFixed(4)}</span>
        </p>
        <Badge variant="outline" className="text-[10px]">{model.status}</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="pr-3 py-1 font-medium">Rank</th>
              <th className="pr-3 py-1 font-medium">Model</th>
              <th className="pr-3 py-1 font-medium">Type</th>
              <th className="pr-3 py-1 font-medium">{primaryMetric}</th>
              <th className="py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((model) => (
              <tr
                key={model.rank}
                className={cn(
                  'border-b border-border/50',
                  model.experimentName === bestExperiment &&
                    'bg-emerald-50 dark:bg-emerald-950/20',
                )}
              >
                <td className="pr-3 py-1.5">{rankMedal(model.rank)}</td>
                <td className="pr-3 py-1.5 font-sans font-medium text-foreground">
                  {model.experimentName}
                  {model.experimentName === bestExperiment && (
                    <span className="ml-1.5 text-amber-500" title="Best model">⭐</span>
                  )}
                </td>
                <td className="pr-3 py-1.5 text-muted-foreground">{model.modelType}</td>
                <td className="pr-3 py-1.5">{model.primaryMetricValue.toFixed(4)}</td>
                <td className="py-1.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{model.status}</Badge>
                </td>
              </tr>
            ))}
            {missingExperiments.length > 0 && (
              <tr className="bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400">
                <td colSpan={5} className="py-1.5 font-sans">
                  ⚠ Missing: {missingExperiments.join(', ')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

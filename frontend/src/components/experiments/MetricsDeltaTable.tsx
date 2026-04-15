import { useMemo } from 'react';
import { useModelStore } from '@/stores/modelStore';
import type { ModelRecord } from '@/types/model';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { cn } from '@/lib/utils';
import { formatMetric } from './utils';
import { LOWER_IS_BETTER } from './modelIcons';

interface MetricsDeltaTableProps {
  modelIds: string[];
}

export function MetricsDeltaTable({ modelIds }: MetricsDeltaTableProps) {
  const models = useModelStore((s) => s.models);
  const selectModel = useExperimentsStore((s) => s.selectModel);
  const selected = useMemo(
    () => modelIds.map((id) => models.find((m) => m.modelId === id)).filter((m): m is ModelRecord => m != null),
    [models, modelIds],
  );

  const { metricKeys, rows } = useMemo(() => {
    const keys = Array.from(new Set(selected.flatMap((m) => (m ? Object.keys(m.metrics) : []))));
    const tableRows = keys.map((key) => {
      const values = selected.map((m) => m?.metrics[key] ?? null);
      const numericValues = values.filter((v): v is number => v != null && Number.isFinite(v));
      const lower = LOWER_IS_BETTER.has(key);
      const bestVal = numericValues.length > 0
        ? (lower ? Math.min(...numericValues) : Math.max(...numericValues))
        : null;
      const worstVal = numericValues.length > 0
        ? (lower ? Math.max(...numericValues) : Math.min(...numericValues))
        : null;
      const delta = bestVal != null && worstVal != null ? bestVal - worstVal : null;
      return { key, values, bestVal, worstVal, delta };
    });
    return { metricKeys: keys, rows: tableRows };
  }, [selected]);

  if (metricKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">No metrics to compare.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Metric</th>
            {selected.map((m) => (
              <th
                key={m.modelId}
                className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide max-w-[120px] truncate cursor-pointer hover:text-foreground transition-colors"
                onClick={() => selectModel(m.modelId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectModel(m.modelId); } }}
              >
                {m.name}
              </th>
            ))}
            <th className="text-right py-2 pl-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">Delta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/50">
              <td className="py-2 pr-4 text-xs font-medium text-foreground">{row.key}</td>
              {row.values.map((val, i) => {
                const isBest = val != null && val === row.bestVal && row.delta != null && row.delta > 0;
                const isWorst = val != null && val === row.worstVal && row.delta != null && row.delta > 0;
                return (
                  <td
                    key={selected[i].modelId}
                    className={cn(
                      'text-right py-2 px-2 tabular-nums text-xs font-mono',
                      isBest && 'text-metric-positive bg-metric-positive/8 dark:bg-metric-positive/12 font-semibold',
                      isWorst && 'text-metric-negative dark:bg-metric-negative/10',
                      !isBest && !isWorst && 'text-foreground',
                    )}
                  >
                    {val != null ? formatMetric(val) : '\u2014'}
                  </td>
                );
              })}
              <td className="text-right py-2 pl-4 tabular-nums text-xs font-mono text-muted-foreground">
                {row.delta != null ? formatMetric(row.delta) : '\u2014'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

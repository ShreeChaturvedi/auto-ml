import { useMemo } from 'react';
import { useModelStore } from '@/stores/modelStore';
import { cn } from '@/lib/utils';
import { formatMetric } from './utils';

interface MetricsDeltaTableProps {
  modelIds: string[];
}

export function MetricsDeltaTable({ modelIds }: MetricsDeltaTableProps) {
  const models = useModelStore((s) => s.models);
  const selected = useMemo(
    () => modelIds.map((id) => models.find((m) => m.modelId === id)).filter(Boolean),
    [models, modelIds],
  );

  const { metricKeys, rows } = useMemo(() => {
    const keys = Array.from(new Set(selected.flatMap((m) => (m ? Object.keys(m.metrics) : []))));
    const tableRows = keys.map((key) => {
      const values = selected.map((m) => m?.metrics[key] ?? null);
      const numericValues = values.filter((v): v is number => v != null && Number.isFinite(v));
      const bestVal = numericValues.length > 0 ? Math.max(...numericValues) : null;
      const worstVal = numericValues.length > 0 ? Math.min(...numericValues) : null;
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
              <th key={m!.modelId} className="text-right py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide max-w-[120px] truncate">
                {m!.name}
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
                    key={selected[i]!.modelId}
                    className={cn(
                      'text-right py-2 px-2 tabular-nums text-xs font-mono',
                      isBest && 'text-emerald-600 dark:text-emerald-400 font-semibold',
                      isWorst && 'text-red-500 dark:text-red-400',
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

import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';

interface ParamImportanceChartProps {
  data: Record<string, number> | null;
  height?: number;
}

export function ParamImportanceChart({ data, height = 160 }: ParamImportanceChartProps) {
  if (data === null) {
    return (
      <div className="space-y-2" style={{ minHeight: height }}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parameter Importance</p>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-28 h-3 rounded chart-skeleton" />
              <div className="flex-1 h-3 rounded chart-skeleton" />
              <div className="w-10 h-3 rounded chart-skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;

  return <ParamBars entries={entries} />;
}

function ParamBars({ entries }: { entries: [string, number][] }) {
  const { colorClasses } = useProjectThemeColor();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parameter Importance</p>
      <div className="space-y-1.5">
        {entries.map(([name, importance]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="w-28 text-xs font-medium truncate" title={name}>{name}</span>
            <div className="flex-1 h-3 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${colorClasses?.fill ?? 'bg-primary'}`}
                style={{ width: `${Math.max(importance * 100, 2)}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs font-mono tabular-nums text-muted-foreground">
              {(importance * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

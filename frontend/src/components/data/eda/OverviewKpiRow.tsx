/**
 * OverviewKpiRow — top-level KPI summary cards for the EDA overview.
 * Displays row count, column count, completeness, and insights at a glance.
 */

import { cn } from '@/lib/utils';
import { formatPercentage } from './edaFormatters';

interface OverviewKpiRowProps {
  totalRows: number;
  totalColumns: number;
  completenessPercent: number;
  strongCorrelations: number;
  insightCount: number;
  className?: string;
}

export function OverviewKpiRow({
  totalRows,
  totalColumns,
  completenessPercent,
  strongCorrelations,
  insightCount,
  className,
}: OverviewKpiRowProps) {
  const completenessColor =
    completenessPercent >= 95
      ? 'text-green-600 dark:text-green-400'
      : completenessPercent >= 80
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-3', className)}>
      {/* Rows */}
      <div className="bg-muted/40 border border-border/30 rounded-lg p-3 shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <div className="text-2xl font-bold font-mono">
          {totalRows.toLocaleString()}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">Rows</div>
      </div>

      {/* Columns */}
      <div className="bg-muted/40 border border-border/30 rounded-lg p-3 shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <div className="text-2xl font-bold font-mono">{totalColumns}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Columns</div>
      </div>

      {/* Completeness */}
      <div className="bg-muted/40 border border-border/30 rounded-lg p-3 shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <div className={cn('text-2xl font-bold font-mono', completenessColor)}>
          {formatPercentage(completenessPercent, true)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">Completeness</div>
      </div>

      {/* Insights */}
      <div className="bg-muted/40 border border-border/30 rounded-lg p-3 shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
        <div className="text-2xl font-bold font-mono">{insightCount}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Insights
          {strongCorrelations > 0 && (
            <span className="ml-1 text-muted-foreground/70">
              ({strongCorrelations} strong corr.)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

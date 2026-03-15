/**
 * QualityPanel — redesigned data quality overview with missing-value matrix,
 * severity-colored health cards, and the scientific aesthetic shared by all EDA tabs.
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { InsightTicker } from '@/components/ui/insight-ticker';
import type { InsightTickerItem } from '@/components/ui/insight-ticker';
import { CheckCircle2 } from 'lucide-react';
import type { EdaSummary, DataQualitySummary } from '@/types/file';
import { cn } from '@/lib/utils';
import type { EdaInsight } from './edaInsights';
import { formatPercentage, DATA_TYPE_ICONS, DATA_TYPE_COLORS } from './edaFormatters';
import { PlotlyMissingValueMatrix } from './PlotlyMissingValueMatrix';
import { ColumnHealthGrid } from './ColumnHealthCards';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const QUALITY_INSIGHT_PREFIXES = ['missing-', 'constant-', 'cardinality-'];

const SEVERITY_LEGEND = [
  { label: 'Pristine', range: '100%', colorClass: 'text-green-500' },
  { label: 'Clean', range: '95-99%', colorClass: 'text-teal-500' },
  { label: 'Fair', range: '80-94%', colorClass: 'text-amber-500' },
  { label: 'Poor', range: '<80%', colorClass: 'text-red-500' },
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function avgMissingColorClass(avg: number): string {
  if (avg < 5) return 'text-green-600 dark:text-green-400';
  if (avg <= 20) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface QualityPanelProps {
  eda: EdaSummary;
  /** Pre-computed insights from parent — avoids recomputing detectInsights */
  insights?: EdaInsight[];
  className?: string;
}

export function QualityPanel({ eda, insights, className }: QualityPanelProps) {
  const data = eda.dataQuality;

  /* ---------- derived data ---------------------------------------- */

  const qualityInsights = useMemo<InsightTickerItem[]>(() => {
    const all = insights ?? [];
    return all
      .filter((ins) => QUALITY_INSIGHT_PREFIXES.some((p) => ins.id.startsWith(p)))
      .map((ins) => ({ icon: ins.icon, text: ins.text, severity: ins.severity }));
  }, [insights]);

  const summary = useMemo(() => {
    const totalColumns = data.length;
    const completeColumns = data.filter((d) => d.missingPercentage === 0).length;
    const columnsWithMissing = data.filter((d) => d.missingCount > 0).length;
    const avgMissingPct =
      data.length > 0
        ? data.reduce((acc, d) => acc + d.missingPercentage, 0) / data.length
        : 0;

    const typeDistribution = data.reduce(
      (acc, d) => {
        acc[d.dataType] = (acc[d.dataType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { totalColumns, completeColumns, columnsWithMissing, avgMissingPct, typeDistribution };
  }, [data]);

  const allColumnsComplete = summary.completeColumns === summary.totalColumns;

  /* ---------- empty state ----------------------------------------- */

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No data quality information available.
      </div>
    );
  }

  /* ---------- render ---------------------------------------------- */

  return (
    <div className={cn('space-y-4', className)}>
      {/* 1. Quality-specific insights */}
      {qualityInsights.length > 0 && (
        <InsightTicker items={qualityInsights} expandable className="mb-1" />
      )}

      {/* 2. Summary KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted/40 border border-border/30 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.3)] p-3">
          <div className="text-2xl font-bold font-mono">{summary.totalColumns}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Columns</div>
        </div>

        <div className="bg-muted/40 border border-border/30 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.3)] p-3">
          <div className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
            {summary.completeColumns}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Complete</div>
        </div>

        <div className="bg-muted/40 border border-border/30 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.3)] p-3">
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {summary.columnsWithMissing}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">With Missing</div>
        </div>

        <div className="bg-muted/40 border border-border/30 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.3)] p-3">
          <div className={cn('text-2xl font-bold font-mono', avgMissingColorClass(summary.avgMissingPct))}>
            {formatPercentage(summary.avgMissingPct)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Avg Missing %</div>
        </div>
      </div>

      {/* 3. Missing-value matrix or positive empty state */}
      {eda.missingMatrix ? (
        <PlotlyMissingValueMatrix missingMatrix={eda.missingMatrix} />
      ) : allColumnsComplete ? (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-4 px-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-900/20">
          <CheckCircle2 className="h-4 w-4" />
          All columns are complete — no missing values detected.
        </div>
      ) : null}

      {/* 4. Type distribution badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(summary.typeDistribution).map(([type, count]) => {
          const Icon = DATA_TYPE_ICONS[type as DataQualitySummary['dataType']];
          return (
            <Badge
              key={type}
              variant="secondary"
              className={cn('gap-1.5', DATA_TYPE_COLORS[type as DataQualitySummary['dataType']])}
            >
              <Icon className="h-3 w-3" />
              {type}: {count}
            </Badge>
          );
        })}
      </div>

      {/* 5. Severity legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {SEVERITY_LEGEND.map((tier) => (
          <span key={tier.label} className="flex items-center gap-1">
            <span className={cn('font-medium', tier.colorClass)}>{tier.label}</span>
            <span>({tier.range})</span>
          </span>
        ))}
      </div>

      {/* 6. Column health grid (replaces the old table) */}
      <ColumnHealthGrid dataQuality={data} />
    </div>
  );
}

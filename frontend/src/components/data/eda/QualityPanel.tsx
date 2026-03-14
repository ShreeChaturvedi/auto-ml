/**
 * QualityPanel — refined data quality overview with monospace formatting,
 * quality-specific insights, and the scientific aesthetic shared by all EDA tabs.
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InsightTicker } from '@/components/ui/insight-ticker';
import type { InsightTickerItem } from '@/components/ui/insight-ticker';
import {
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { EdaSummary, DataQualitySummary } from '@/types/file';
import { cn } from '@/lib/utils';
import type { EdaInsight } from './edaInsights';
import { formatPercentage, DATA_TYPE_ICONS, DATA_TYPE_COLORS } from './edaFormatters';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const QUALITY_INSIGHT_PREFIXES = ['missing-', 'constant-', 'cardinality-'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getMissingStatus(
  percentage: number,
): { label: string; color: string; icon: typeof CheckCircle2 } {
  if (percentage === 0) {
    return { label: 'Complete', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 };
  }
  if (percentage < 5) {
    return { label: 'Low', color: 'text-yellow-600 dark:text-yellow-400', icon: AlertTriangle };
  }
  if (percentage < 20) {
    return { label: 'Moderate', color: 'text-orange-600 dark:text-orange-400', icon: AlertTriangle };
  }
  return { label: 'High', color: 'text-red-600 dark:text-red-400', icon: AlertTriangle };
}

function avgMissingColor(avg: number): string {
  if (avg < 5) return 'text-green-600 dark:text-green-400';
  if (avg <= 20) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
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
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-2xl font-bold font-mono">{summary.totalColumns}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Columns</div>
        </div>

        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
            {summary.completeColumns}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Complete</div>
        </div>

        <div className="bg-muted/30 rounded-lg p-3">
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {summary.columnsWithMissing}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">With Missing</div>
        </div>

        <div className="bg-muted/30 rounded-lg p-3">
          <div className={cn('text-2xl font-bold font-mono', avgMissingColor(summary.avgMissingPct))}>
            {formatPercentage(summary.avgMissingPct)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Avg Missing %</div>
        </div>
      </div>

      {/* 3. Type distribution badges */}
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

      {/* 4. Column details table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Missing</TableHead>
              <TableHead className="w-[130px]">Completeness</TableHead>
              <TableHead className="text-right">Unique</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((col) => {
              const Icon = DATA_TYPE_ICONS[col.dataType];
              const status = getMissingStatus(col.missingPercentage);
              const StatusIcon = status.icon;
              const completeness = 100 - col.missingPercentage;

              return (
                <TableRow key={col.column}>
                  {/* Name */}
                  <TableCell
                    className="font-medium max-w-[150px] truncate"
                    title={col.column}
                  >
                    {col.column}
                  </TableCell>

                  {/* Type badge */}
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn('gap-1 text-xs', DATA_TYPE_COLORS[col.dataType])}
                    >
                      <Icon className="h-3 w-3" />
                      {col.dataType}
                    </Badge>
                  </TableCell>

                  {/* Missing */}
                  <TableCell className="text-right font-mono text-xs">
                    {col.missingCount > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        {col.missingCount.toLocaleString()} ({formatPercentage(col.missingPercentage)})
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>

                  {/* Completeness */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={completeness} className="h-2" />
                      <span className="text-xs font-mono w-10 text-right">
                        {formatPercentage(completeness, true)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Unique */}
                  <TableCell className="text-right font-mono text-xs">
                    {col.uniqueCount.toLocaleString()}
                    <span className="text-muted-foreground ml-1">
                      ({formatPercentage(col.uniquePercentage, true)})
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <div className={cn('flex items-center gap-1 text-xs', status.color)}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {status.label}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

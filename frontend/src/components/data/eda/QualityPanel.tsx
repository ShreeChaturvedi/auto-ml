/**
 * QualityPanel — data quality overview with missing-value chart,
 * inline sortable quality table, and the scientific aesthetic shared by all EDA tabs.
 */

import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { InsightTicker } from '@/components/ui/insight-ticker';
import type { InsightTickerItem } from '@/components/ui/insight-ticker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EdaSummary, ColumnDataType } from '@/types/file';
import { cn } from '@/lib/utils';
import { SortHeader } from '@/components/ui/SortHeader';
import type { EdaInsight } from './edaInsights';
import { formatPercentage } from './edaFormatters';
import { getSeverityLabel, mapEDATypeToColumnType } from './edaConstants';
import { PlotlyMissingValueMatrix } from './PlotlyMissingValueMatrix';
import { TypeIcon } from '../TypeIcon';
import { getTypeLabel } from '../columnTypeUtils';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const QUALITY_INSIGHT_PREFIXES = ['missing-', 'constant-', 'cardinality-'];

type SortField = 'column' | 'completeness' | 'missing' | 'unique';

const KPI_CARD = 'bg-muted/40 border border-border/30 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.3)] p-3';
const CELL = 'px-3 py-2';

/* Completeness ring constants */
const RING_SIZE = 20;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/* Severity footnote legend */
const SEVERITY_LEGEND = [
  { label: 'Pristine', range: '100%', var: '--eda-pristine' },
  { label: 'Clean', range: '95–99%', var: '--eda-clean' },
  { label: 'Fair', range: '80–94%', var: '--eda-fair' },
  { label: 'Poor', range: '<80%', var: '--eda-poor' },
] as const;

type QualityKpi = {
  value: string | number;
  label: string;
  color?: string;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface QualityPanelProps {
  eda: EdaSummary;
  /** Pre-computed insights from parent — avoids recomputing detectInsights */
  insights?: EdaInsight[];
  columnTypes?: Record<string, ColumnDataType>;
  className?: string;
}

export function QualityPanel({ eda, insights, columnTypes, className }: QualityPanelProps) {
  const data = eda.dataQuality;

  /* ---------- sort state ----------------------------------------- */

  const [sortField, setSortField] = useState<SortField>('completeness');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

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

    return { totalColumns, completeColumns, columnsWithMissing, avgMissingPct };
  }, [data]);

  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      switch (sortField) {
        case 'column': return a.column.localeCompare(b.column);
        case 'completeness': return a.missingPercentage - b.missingPercentage; // lower missing = higher completeness
        case 'missing': return a.missingCount - b.missingCount;
        case 'unique': return a.uniqueCount - b.uniqueCount;
      }
    });
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [data, sortField, sortDir]);

  const allColumnsComplete = summary.completeColumns === summary.totalColumns;
  const avgCompleteness = 100 - summary.avgMissingPct;
  const avgSeverity = getSeverityLabel(avgCompleteness);

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
        {([
          { value: summary.totalColumns, label: 'Total Columns' },
          { value: summary.completeColumns, label: 'Complete', color: 'text-green-600 dark:text-green-400' },
          { value: summary.columnsWithMissing, label: 'With Missing', color: 'text-amber-600 dark:text-amber-400' },
          { value: formatPercentage(summary.avgMissingPct), label: 'Avg Missing %', color: avgSeverity.colorClass },
        ] satisfies QualityKpi[]).map((kpi) => (
          <div key={kpi.label} className={KPI_CARD}>
            <div className={cn('text-2xl font-bold font-mono', kpi.color)}>{kpi.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* 3. Missing-value chart or positive empty state */}
      {eda.missingMatrix ? (
        <PlotlyMissingValueMatrix missingMatrix={eda.missingMatrix} />
      ) : allColumnsComplete ? (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-4 px-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-900/20">
          <CheckCircle2 className="h-4 w-4" />
          All columns are complete — no missing values detected.
        </div>
      ) : null}

      {/* 4. Sortable quality table (inline — no TanStack) */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader field="column" label="Column" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} headerClassName="" className={cn(CELL, 'text-xs')} />
              <TableHead className={cn(CELL, 'text-xs')}>Type</TableHead>
              <SortHeader field="completeness" label="Completeness" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} headerClassName="" className={cn(CELL, 'text-xs')} />
              <SortHeader field="missing" label="Missing" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} headerClassName="" className={cn(CELL, 'text-xs')} />
              <SortHeader field="unique" label="Unique" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} headerClassName="" className={cn(CELL, 'text-xs')} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row) => {
              const completeness = 100 - row.missingPercentage;
              const severity = getSeverityLabel(completeness);
              const offset = RING_CIRCUMFERENCE * (1 - completeness / 100);
              const resolvedType = columnTypes?.[row.column] ?? mapEDATypeToColumnType(row.dataType);

              return (
                <TableRow key={row.column}>
                  <TableCell className={CELL}>
                    <span className="text-sm font-medium truncate block max-w-[200px]" title={row.column}>
                      {row.column}
                    </span>
                  </TableCell>
                  <TableCell className={CELL}>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <TypeIcon type={resolvedType} className="h-3.5 w-3.5" />
                      {getTypeLabel(resolvedType)}
                    </span>
                  </TableCell>
                  <TableCell className={CELL}>
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                        <circle
                          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                          fill="none" stroke="currentColor" strokeWidth={RING_STROKE} opacity={0.15}
                        />
                        <circle
                          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                          fill="none" stroke={`hsl(var(${severity.colorVar}))`}
                          strokeWidth={RING_STROKE} strokeDasharray={RING_CIRCUMFERENCE}
                          strokeDashoffset={offset} strokeLinecap="round"
                          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                        />
                      </svg>
                      <span className={cn('text-xs font-mono tabular-nums', severity.colorClass)}>
                        {formatPercentage(completeness, true)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className={CELL}>
                    <span className={cn('text-xs font-mono tabular-nums', row.missingCount === 0 && 'text-muted-foreground/50')}>
                      {row.missingCount.toLocaleString()}
                      <span className="text-muted-foreground ml-1">({formatPercentage(row.missingPercentage)})</span>
                    </span>
                  </TableCell>
                  <TableCell className={CELL}>
                    <span className="text-xs font-mono tabular-nums">
                      {row.uniqueCount.toLocaleString()}
                      <span className="text-muted-foreground ml-1">({formatPercentage(row.uniquePercentage)})</span>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 5. Styled severity footnote */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {SEVERITY_LEGEND.map((t) => (
          <span key={t.label} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: `hsl(var(${t.var}))` }}
            />
            <span className="font-medium">{t.label}</span>
            <span>({t.range})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

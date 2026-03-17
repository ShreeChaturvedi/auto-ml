/**
 * OverviewColumnCards — compact per-column cards with sparkline previews.
 * Click a card to expand its detailed statistics below the grid.
 */

import { useState, useMemo } from 'react';
import { Hash, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, formatPercentage, truncateText } from './edaFormatters';
import { SparklineHistogram } from './SparklineHistogram';
import type {
  EdaSummary,
  NumericColumnSummary,
  CategoricalColumnSummary,
  HistogramData,
} from '@/types/file';

interface OverviewColumnCardsProps {
  eda: EdaSummary;
  className?: string;
}

/** Unified column descriptor used internally */
interface ColumnEntry {
  name: string;
  kind: 'numeric' | 'categorical';
  numeric?: NumericColumnSummary;
  categorical?: CategoricalColumnSummary;
  histogram?: HistogramData;
}

export function OverviewColumnCards({ eda, className }: OverviewColumnCardsProps) {
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);

  const columns = useMemo<ColumnEntry[]>(() => {
    const histogramMap = new Map<string, HistogramData>();
    if (eda.histograms) {
      for (const h of eda.histograms) {
        histogramMap.set(h.column, h);
      }
    }
    if (eda.histogram) {
      histogramMap.set(eda.histogram.column, eda.histogram);
    }

    const entries: ColumnEntry[] = [];

    for (const col of eda.numericColumns) {
      entries.push({
        name: col.column,
        kind: 'numeric',
        numeric: col,
        histogram: histogramMap.get(col.column),
      });
    }

    for (const col of eda.categoricalColumns) {
      entries.push({
        name: col.column,
        kind: 'categorical',
        categorical: col,
        histogram: histogramMap.get(col.column),
      });
    }

    return entries;
  }, [eda.numericColumns, eda.categoricalColumns, eda.histograms, eda.histogram]);

  const expandedEntry = useMemo(
    () => columns.find((c) => c.name === expandedColumn) ?? null,
    [columns, expandedColumn],
  );

  const handleCardClick = (name: string) => {
    setExpandedColumn((prev) => (prev === name ? null : name));
  };

  return (
    <div className={className}>
      {/* Card grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
        {columns.map((col) => (
          <button
            key={col.name}
            type="button"
            onClick={() => handleCardClick(col.name)}
            className={cn(
              'border border-border/30 rounded-md px-2.5 py-2 hover:bg-muted/50 hover:border-border/60 cursor-pointer transition-colors text-left',
              expandedColumn === col.name && 'ring-1 ring-[hsl(var(--eda-blue))] bg-muted/40',
            )}
          >
            {/* Row 1: name + type icon */}
            <div className="flex items-center gap-1.5">
              {col.kind === 'numeric' ? (
                <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Type className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-xs font-medium truncate">
                {truncateText(col.name, 18)}
              </span>
            </div>

            {/* Row 2: sparkline + key stat */}
            <div className="flex items-center gap-2 mt-1.5">
              {col.histogram && (
                <SparklineHistogram
                  buckets={col.histogram.buckets}
                  width={60}
                  height={28}
                />
              )}
              <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                {col.kind === 'numeric' && col.numeric
                  ? `mean ${formatNumber(col.numeric.mean)}`
                  : col.categorical
                    ? `${col.categorical.uniqueCount} unique`
                    : ''}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Expanded detail panel */}
      {expandedEntry && (
        <div className="border rounded-md p-4 mt-2">
          {expandedEntry.kind === 'numeric' && expandedEntry.numeric ? (
            <NumericDetail col={expandedEntry.numeric} />
          ) : expandedEntry.kind === 'categorical' && expandedEntry.categorical ? (
            <CategoricalDetail col={expandedEntry.categorical} />
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Numeric expanded detail                                            */
/* ------------------------------------------------------------------ */

function NumericDetail({ col }: { col: NumericColumnSummary }) {
  const range = col.max - col.min || 1;
  const skewnessLabel =
    Math.abs(col.skewness) < 0.5
      ? 'Symmetric'
      : col.skewness > 0
        ? 'Right-skewed'
        : 'Left-skewed';

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{col.column}</div>

      {/* IQR range bar */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-1">
          Range: {formatNumber(col.min)} &ndash; {formatNumber(col.max)}
        </div>
        <div className="h-2 bg-muted rounded-full relative overflow-hidden">
          <div
            className="absolute h-full bg-primary rounded-full"
            style={{
              left: `${((col.q1 - col.min) / range) * 100}%`,
              width: `${((col.q3 - col.q1) / range) * 100}%`,
            }}
          />
          <div
            className="absolute w-0.5 h-full bg-foreground"
            style={{
              left: `${((col.median - col.min) / range) * 100}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Q1: {formatNumber(col.q1)}</span>
          <span>Median: {formatNumber(col.median)}</span>
          <span>Q3: {formatNumber(col.q3)}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
        <StatCell label="Mean" value={formatNumber(col.mean)} />
        <StatCell label="Median" value={formatNumber(col.median)} />
        <StatCell label="Std Dev" value={formatNumber(col.stdDev)} />
        <StatCell label="IQR" value={formatNumber(col.q3 - col.q1)} />
        <StatCell label="Q1" value={formatNumber(col.q1)} />
        <StatCell label="Q3" value={formatNumber(col.q3)} />
      </div>

      {/* Skewness + outliers */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">
          Skewness:{' '}
          <span className="font-mono font-medium text-foreground">
            {col.skewness.toFixed(2)} ({skewnessLabel})
          </span>
        </span>
        {col.outlierCount > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {col.outlierCount.toLocaleString()} outlier{col.outlierCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono font-medium">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Categorical expanded detail                                        */
/* ------------------------------------------------------------------ */

function CategoricalDetail({ col }: { col: CategoricalColumnSummary }) {
  const maxCount = useMemo(
    () => Math.max(...col.topValues.map((v) => v.count), 1),
    [col.topValues],
  );

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{col.column}</div>

      {/* Top values horizontal bars */}
      <div className="space-y-1">
        {col.topValues.map((v) => (
          <div key={v.value} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-muted-foreground" title={v.value}>
              {truncateText(v.value, 14)}
            </span>
            <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden">
              <div
                className="h-full bg-primary/50 rounded-sm"
                style={{ width: `${(v.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="font-mono text-[10px] w-10 text-right text-muted-foreground">
              {formatPercentage(v.percentage)}
            </span>
          </div>
        ))}
      </div>

      {/* Mode + missing */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {col.mode && (
          <span>
            Mode: <span className="font-medium text-foreground">{col.mode}</span>
          </span>
        )}
        <span>
          Missing:{' '}
          <span className="font-mono font-medium text-foreground">
            {col.missingCount.toLocaleString()}
          </span>
        </span>
      </div>
    </div>
  );
}

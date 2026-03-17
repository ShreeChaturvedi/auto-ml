/**
 * DistributionsPanel — Distributions tab content for the EDA view.
 * Composes histogram, box/violin, and categorical bar charts.
 * Controls are rendered in the EDAToolbar; this component only renders charts.
 */

import { useEffect, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DistributionMode } from './edaConstants';
import { PlotlyHistogram } from './PlotlyHistogram';
import { PlotlyBoxViolin } from './PlotlyBoxViolin';
import { PlotlyCategoricalBar } from './PlotlyCategoricalBar';
import type {
  EdaSummary,
  NumericColumnSummary,
  HistogramData,
  CategoricalColumnSummary,
} from '@/types/file';

interface DistributionsPanelProps {
  eda: EdaSummary;
  /** Currently selected primary column (lifted state). */
  selectedColumn: string | null;
  onSelectedColumnChange: (col: string | null) => void;
  /** Additional columns for box/violin comparison (lifted state). */
  compareColumns: string[];
  /** Active chart mode (lifted state). */
  mode: DistributionMode;
  className?: string;
}

export function DistributionsPanel({
  eda,
  selectedColumn,
  onSelectedColumnChange,
  compareColumns,
  mode,
  className,
}: DistributionsPanelProps) {
  // ---------------------------------------------------------------------------
  // Derived data (memoised)
  // ---------------------------------------------------------------------------

  /** Map column name -> NumericColumnSummary for fast lookup. */
  const numericMap = useMemo(
    () => new Map(eda.numericColumns.map((c) => [c.column, c])),
    [eda.numericColumns],
  );

  /** Map column name -> CategoricalColumnSummary for fast lookup. */
  const categoricalMap = useMemo(
    () => new Map(eda.categoricalColumns.map((c) => [c.column, c])),
    [eda.categoricalColumns],
  );

  /** Map column name -> HistogramData for fast lookup. */
  const histogramMap = useMemo(
    () => new Map((eda.histograms ?? []).map((h) => [h.column, h])),
    [eda.histograms],
  );

  /** Whether the currently selected column is categorical. */
  const selectedIsCategorical = useMemo(
    () => (selectedColumn ? categoricalMap.has(selectedColumn) : false),
    [selectedColumn, categoricalMap],
  );

  /** NumericColumnSummary entries for box/violin mode (primary + compare). */
  const boxViolinColumns = useMemo<NumericColumnSummary[]>(() => {
    const names = selectedColumn
      ? [selectedColumn, ...compareColumns.filter((c) => c !== selectedColumn)]
      : compareColumns;

    return names
      .map((n) => numericMap.get(n))
      .filter((c): c is NumericColumnSummary => c !== undefined);
  }, [selectedColumn, compareColumns, numericMap]);

  /** Histograms matching the box/violin column set. */
  const boxViolinHistograms = useMemo<HistogramData[]>(
    () =>
      boxViolinColumns
        .map((c) => histogramMap.get(c.column))
        .filter((h): h is HistogramData => h !== undefined),
    [boxViolinColumns, histogramMap],
  );

  /** First categorical column for the bottom categorical section. */
  const activeCategorical = useMemo<CategoricalColumnSummary | null>(() => {
    if (selectedColumn && categoricalMap.has(selectedColumn)) {
      return categoricalMap.get(selectedColumn)!;
    }
    return eda.categoricalColumns[0] ?? null;
  }, [selectedColumn, categoricalMap, eda.categoricalColumns]);

  // ---------------------------------------------------------------------------
  // Auto-select first numeric column when nothing is selected
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (selectedColumn === null && eda.numericColumns.length > 0) {
      onSelectedColumnChange(eda.numericColumns[0].column);
    }
  }, [selectedColumn, eda.numericColumns, onSelectedColumnChange]);

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (eda.numericColumns.length === 0 && eda.categoricalColumns.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground',
          className,
        )}
      >
        <BarChart3 className="h-10 w-10 opacity-40" />
        <p className="text-sm">No numeric or categorical columns to visualise.</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn('space-y-4', className)}>
      {/* ---- Main chart area ---- */}
      {mode === 'histogram' && selectedColumn && (
        <>
          {selectedIsCategorical ? (
            <PlotlyCategoricalBar
              data={categoricalMap.get(selectedColumn)!}
              height={320}
            />
          ) : (
            (() => {
              const hist = histogramMap.get(selectedColumn);
              if (!hist) {
                return (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    No histogram data available for {selectedColumn}.
                  </div>
                );
              }
              return (
                <PlotlyHistogram
                  histogram={hist}
                  numericSummary={numericMap.get(selectedColumn)}
                  showKDE
                  height={320}
                />
              );
            })()
          )}
        </>
      )}

      {(mode === 'box' || mode === 'violin') && (
        <PlotlyBoxViolin
          columns={boxViolinColumns}
          histograms={boxViolinHistograms}
          mode={mode}
          height={350}
        />
      )}

      {/* ---- Categorical section ---- */}
      {eda.categoricalColumns.length > 0 && activeCategorical && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            Categorical Distributions
          </h4>
          <PlotlyCategoricalBar data={activeCategorical} height={250} />
        </div>
      )}
    </div>
  );
}

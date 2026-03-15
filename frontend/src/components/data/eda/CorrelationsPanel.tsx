import { useState, useMemo } from 'react';
import { Waypoints, X, Grid3x3, Box, ScatterChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EdaSummary } from '@/types/file';
import { IconModeToggle } from '@/components/data/IconModeToggle';
import { PlotlyHeatmap } from './PlotlyHeatmap';
import { PlotlyScatter } from './PlotlyScatter';
import { PlotlyPairPlot } from './PlotlyPairPlot';
import { PlotlyScatter3D } from './PlotlyScatter3D';
import { CorrelationPairsList } from './CorrelationPairsList';

interface CorrelationsPanelProps {
  eda: EdaSummary;
  /** Raw dataset rows — threaded from DataTable for scatter/pair plots */
  rows?: Record<string, unknown>[];
  /** Lifted state from parent so it persists across tab switches */
  selectedCell: { a: string; b: string } | null;
  onSelectedCellChange: (cell: { a: string; b: string } | null) => void;
  className?: string;
}

export function CorrelationsPanel({
  eda,
  rows,
  selectedCell,
  onSelectedCellChange,
  className,
}: CorrelationsPanelProps) {
  const [viewMode, setViewMode] = useState<'heatmap' | 'pairplot' | '3d'>('heatmap');

  const numericColumnNames = useMemo(
    () => eda.numericColumns.map((c) => c.column),
    [eda.numericColumns],
  );

  const correlations = useMemo(() => eda.correlations ?? [], [eda.correlations]);

  // Look up selected pair in scatterPairs (order-independent)
  const scatterPairMatch = useMemo(() => {
    if (!selectedCell) return null;
    const { a, b } = selectedCell;

    // Check scatterPairs first
    if (eda.scatterPairs) {
      const match = eda.scatterPairs.find(
        (sp) =>
          (sp.xColumn === a && sp.yColumn === b) ||
          (sp.xColumn === b && sp.yColumn === a),
      );
      if (match) return match;
    }

    // Fall back to legacy eda.scatter
    if (eda.scatter) {
      const { xColumn, yColumn } = eda.scatter;
      if (
        (xColumn === a && yColumn === b) ||
        (xColumn === b && yColumn === a)
      ) {
        return eda.scatter;
      }
    }

    return null;
  }, [selectedCell, eda.scatterPairs, eda.scatter]);

  const selectedCoefficient = useMemo(() => {
    if (!selectedCell) return undefined;
    const { a, b } = selectedCell;
    const pair = correlations.find(
      (c) =>
        (c.columnA === a && c.columnB === b) ||
        (c.columnA === b && c.columnB === a),
    );
    return pair?.coefficient;
  }, [selectedCell, correlations]);

  const viewModeOptions = useMemo(
    () => [
      { value: 'heatmap' as const, ariaLabel: 'Heatmap', icon: Grid3x3, tooltip: 'Correlation Heatmap' },
      { value: 'pairplot' as const, ariaLabel: 'Pair Plot', icon: ScatterChart, tooltip: 'Pair Plot Matrix' },
      {
        value: '3d' as const,
        ariaLabel: '3D',
        icon: Box,
        tooltip: numericColumnNames.length < 3 ? 'Need 3+ numeric columns' : '3D Scatter',
      },
    ],
    [numericColumnNames.length],
  );

  // Empty state: fewer than 2 numeric columns
  if (numericColumnNames.length < 2 || correlations.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 text-muted-foreground', className)}>
        <Waypoints className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Need at least 2 numeric columns for correlation analysis</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* View mode toggle */}
      <div className="flex items-center justify-end px-1">
        <IconModeToggle
          value={viewMode}
          onValueChange={(v) => {
            if (v) setViewMode(v as 'heatmap' | 'pairplot' | '3d');
          }}
          options={viewModeOptions}
        />
      </div>

      {/* Heatmap view */}
      {viewMode === 'heatmap' && (
        <>
          {/* Heatmap */}
          <PlotlyHeatmap
            correlations={correlations}
            numericColumns={numericColumnNames}
            onCellClick={(columnA, columnB) =>
              onSelectedCellChange({ a: columnA, b: columnB })
            }
          />

          {/* Scatter reveal (animated expand / collapse) */}
          <div
            className={cn(
              'overflow-hidden transition-all duration-300',
              selectedCell ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0',
            )}
          >
            {selectedCell && (
              <div className="rounded-lg border bg-card p-4">
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium">
                    {selectedCell.a} vs {selectedCell.b}
                  </h4>
                  <button
                    type="button"
                    onClick={() => onSelectedCellChange(null)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Dismiss scatter plot"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Scatter: from scatterPairs, or client-side fallback via rows */}
                {scatterPairMatch ? (
                  <PlotlyScatter
                    data={scatterPairMatch}
                    correlation={selectedCoefficient}
                  />
                ) : rows ? (
                  <PlotlyScatter
                    rows={rows}
                    xColumn={selectedCell.a}
                    yColumn={selectedCell.b}
                    correlation={selectedCoefficient}
                  />
                ) : (
                  <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                    Scatter plot data not available for this pair.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top correlated pairs */}
          <div className="mt-2">
            <h4 className="text-xs font-medium text-muted-foreground mb-1 px-1">
              Top correlated pairs
            </h4>
            <CorrelationPairsList
              correlations={correlations}
              maxPairs={5}
              onPairClick={(columnA, columnB) =>
                onSelectedCellChange({ a: columnA, b: columnB })
              }
            />
          </div>
        </>
      )}

      {/* Pair Plot view */}
      {viewMode === 'pairplot' && (
        rows ? (
          <PlotlyPairPlot
            rows={rows}
            numericColumns={eda.numericColumns}
          />
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Row data not available for this view.
          </div>
        )
      )}

      {/* 3D Scatter view */}
      {viewMode === '3d' && (
        rows ? (
          <PlotlyScatter3D
            rows={rows}
            numericColumns={eda.numericColumns}
          />
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Row data not available for this view.
          </div>
        )
      )}
    </div>
  );
}

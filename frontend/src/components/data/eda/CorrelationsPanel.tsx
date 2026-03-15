import { useMemo } from 'react';
import { GitBranch, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EdaSummary } from '@/types/file';
import { PlotlyHeatmap } from './PlotlyHeatmap';
import { PlotlyScatter } from './PlotlyScatter';
import { CorrelationPairsList } from './CorrelationPairsList';

interface CorrelationsPanelProps {
  eda: EdaSummary;
  /** Raw dataset rows — threaded from DataTable for future scatter/pair plots */
  rows?: Record<string, unknown>[];
  /** Lifted state from parent so it persists across tab switches */
  selectedCell: { a: string; b: string } | null;
  onSelectedCellChange: (cell: { a: string; b: string } | null) => void;
  className?: string;
}

export function CorrelationsPanel({
  eda,
  selectedCell,
  onSelectedCellChange,
  className,
}: CorrelationsPanelProps) {
  const numericColumnNames = useMemo(
    () => eda.numericColumns.map((c) => c.column),
    [eda.numericColumns],
  );

  const correlations = useMemo(() => eda.correlations ?? [], [eda.correlations]);

  const scatterMatch = useMemo(() => {
    if (!selectedCell || !eda.scatter) return null;
    const { a, b } = selectedCell;
    const { xColumn, yColumn } = eda.scatter;
    if (
      (xColumn === a && yColumn === b) ||
      (xColumn === b && yColumn === a)
    ) {
      return eda.scatter;
    }
    return null;
  }, [selectedCell, eda.scatter]);

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

  // Empty state: fewer than 2 numeric columns
  if (numericColumnNames.length < 2 || correlations.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 text-muted-foreground', className)}>
        <GitBranch className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Need at least 2 numeric columns for correlation analysis</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
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

            {/* Scatter or unavailable message */}
            {scatterMatch ? (
              <PlotlyScatter
                data={scatterMatch}
                correlation={selectedCoefficient}
              />
            ) : (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                Scatter plot data not available for this pair.
                Only the first two numeric columns have scatter data.
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
    </div>
  );
}

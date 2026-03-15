/**
 * EDAPanel — Main orchestrator for the Exploratory Data Analysis view.
 * Renders the active tab via conditional rendering (unmounts inactive panels).
 * All state is lifted to DataTable and flows in as props.
 */

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EdaSummary, ColumnDataType } from '@/types/file';

export type EdaTab = 'overview' | 'distributions' | 'correlations' | 'quality';

// Insights
import { detectInsights } from './edaInsights';
import { InsightTicker } from '@/components/ui/insight-ticker';

// Overview tab components
import { OverviewKpiRow } from './OverviewKpiRow';
import { OverviewColumnCards } from './OverviewColumnCards';
import { PlotlyParallelCoords } from './PlotlyParallelCoords';
import { PlotlyHeatmap } from './PlotlyHeatmap';

// Distributions tab
import { DistributionsPanel } from './DistributionsPanel';

// Correlations tab
import { CorrelationsPanel } from './CorrelationsPanel';

// Quality tab
import { QualityPanel } from './QualityPanel';

interface EDAPanelProps {
  eda: EdaSummary;
  rows?: Record<string, unknown>[];
  columnTypes?: Record<string, ColumnDataType>;
  activeTab: EdaTab;
  setActiveTab: (tab: EdaTab) => void;
  distSelectedColumn: string | null;
  onDistSelectedColumnChange: (col: string | null) => void;
  distCompareColumns: string[];
  onDistCompareColumnsChange: (cols: string[]) => void;
  distMode: 'histogram' | 'box' | 'violin';
  onDistModeChange: (mode: 'histogram' | 'box' | 'violin') => void;
  corrSelectedCell: { a: string; b: string } | null;
  onCorrSelectedCellChange: (cell: { a: string; b: string } | null) => void;
  corrViewMode: 'heatmap' | 'pairplot' | '3d';
  onCorrViewModeChange: (v: 'heatmap' | 'pairplot' | '3d') => void;
  className?: string;
}

export function EDAPanel({
  eda,
  rows,
  columnTypes,
  activeTab,
  setActiveTab,
  distSelectedColumn,
  onDistSelectedColumnChange,
  distCompareColumns,
  onDistCompareColumnsChange,
  distMode,
  onDistModeChange,
  corrSelectedCell,
  onCorrSelectedCellChange,
  corrViewMode,
  onCorrViewModeChange,
  className,
}: EDAPanelProps) {
  const insights = useMemo(() => detectInsights(eda), [eda]);

  const numericColumns = eda.numericColumns ?? [];
  const categoricalColumns = eda.categoricalColumns ?? [];
  const correlations = eda.correlations ?? [];
  const hasNumeric = numericColumns.length > 0;
  const hasCategorical = categoricalColumns.length > 0;
  const hasCorrelations = correlations.length > 0;

  return (
    <div className={cn('p-4', className)}>
      {/* ---- Overview ---- */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {insights.length > 0 && (
            <InsightTicker
              items={insights.map((i) => ({ icon: i.icon, text: i.text, severity: i.severity }))}
              className="mb-2"
            />
          )}
          <OverviewKpiRow eda={eda} insightCount={insights.length} />
          <OverviewColumnCards eda={eda} />
          {numericColumns.length >= 2 && rows && rows.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1">Multivariate Overview</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Each vertical axis is a numeric column. Lines connect values in the same row.
                Drag on any axis to filter.
              </p>
              <PlotlyParallelCoords rows={rows} numericColumns={numericColumns} height={250} />
            </div>
          )}
          {hasCorrelations && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Correlation Preview</h4>
                <button
                  type="button"
                  onClick={() => setActiveTab('correlations')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View details &rarr;
                </button>
              </div>
              <PlotlyHeatmap
                correlations={correlations}
                numericColumns={numericColumns.map((c) => c.column)}
                height={200}
                onCellClick={() => setActiveTab('correlations')}
              />
            </div>
          )}
          {!hasNumeric && !hasCategorical && (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm font-medium">No analyzable columns found</p>
            </div>
          )}
        </div>
      )}

      {/* ---- Distributions ---- */}
      {activeTab === 'distributions' && (
        <DistributionsPanel
          eda={eda}
          selectedColumn={distSelectedColumn}
          onSelectedColumnChange={onDistSelectedColumnChange}
          compareColumns={distCompareColumns}
          onCompareColumnsChange={onDistCompareColumnsChange}
          mode={distMode}
          onModeChange={onDistModeChange}
        />
      )}

      {/* ---- Correlations ---- */}
      {activeTab === 'correlations' && (
        <CorrelationsPanel
          eda={eda}
          rows={rows}
          selectedCell={corrSelectedCell}
          onSelectedCellChange={onCorrSelectedCellChange}
          viewMode={corrViewMode}
          onViewModeChange={onCorrViewModeChange}
        />
      )}

      {/* ---- Quality ---- */}
      {activeTab === 'quality' && (
        <QualityPanel eda={eda} insights={insights} columnTypes={columnTypes} />
      )}
    </div>
  );
}

/**
 * EDAToolbar — sticky ribbon with icon tab selector + per-tab controls.
 * Renders below DataTableControls when EDA view is active.
 * Does NOT contain the table/eda toggle (that lives in DataTableControls).
 */

import { useMemo } from 'react';
import { Layers, ChartSpline, BarChart3, Waypoints, Heart, BoxSelect, Activity, Grid3x3, ScatterChart, Box } from 'lucide-react';
import type { EdaSummary } from '@/types/file';
import type { EdaTab } from './EDAPanel';
import type { DistributionMode, CorrViewMode } from './edaConstants';
import { EDAColumnSelector } from './EDAColumnSelector';
import { IconModeToggle, type IconModeToggleOption } from '../IconModeToggle';

const TAB_OPTIONS: IconModeToggleOption[] = [
  { value: 'overview', ariaLabel: 'Overview', icon: Layers, tooltip: 'Overview' },
  { value: 'distributions', ariaLabel: 'Distributions', icon: ChartSpline, tooltip: 'Distributions' },
  { value: 'correlations', ariaLabel: 'Relationships', icon: Waypoints, tooltip: 'Relationships' },
  { value: 'quality', ariaLabel: 'Quality', icon: Heart, tooltip: 'Quality' },
];

const DIST_MODE_OPTIONS: IconModeToggleOption[] = [
  { value: 'histogram', ariaLabel: 'Histogram', icon: BarChart3, tooltip: 'Histogram' },
  { value: 'box', ariaLabel: 'Box plot', icon: BoxSelect, tooltip: 'Box Plot' },
  { value: 'violin', ariaLabel: 'Violin plot', icon: Activity, tooltip: 'Violin Plot' },
];

interface EDAToolbarProps {
  eda: EdaSummary;
  activeTab: EdaTab;
  onActiveTabChange: (tab: EdaTab) => void;
  distSelectedColumn: string | null;
  onDistSelectedColumnChange: (col: string | null) => void;
  distMode: DistributionMode;
  onDistModeChange: (mode: DistributionMode) => void;
  distCompareColumns: string[];
  onDistCompareColumnsChange: (cols: string[]) => void;
  corrViewMode: CorrViewMode;
  onCorrViewModeChange: (v: CorrViewMode) => void;
}

export function EDAToolbar({
  eda,
  activeTab,
  onActiveTabChange,
  distSelectedColumn,
  onDistSelectedColumnChange,
  distMode,
  onDistModeChange,
  distCompareColumns,
  onDistCompareColumnsChange,
  corrViewMode,
  onCorrViewModeChange,
}: EDAToolbarProps) {
  // Derive selector columns and numeric count locally — no need to prop-drill from DataTable
  const selectorColumns = useMemo(
    () => eda.dataQuality?.map((col) => ({ name: col.column, type: col.dataType })) ?? [],
    [eda.dataQuality],
  );
  const numericCount = eda.numericColumns?.length ?? 0;

  return (
    <div className="sticky top-0 z-10 bg-background border-b">
      <div className="flex items-center gap-3 px-4 h-10">
        {/* Left: tab selector */}
        <IconModeToggle
          value={activeTab}
          onValueChange={(v) => onActiveTabChange(v as EdaTab)}
          options={TAB_OPTIONS}
        />

        {/* Right: per-tab controls */}
        {activeTab === 'distributions' && (
          <div className="ml-auto flex items-center gap-2">
            <EDAColumnSelector
              columns={selectorColumns}
              selected={distSelectedColumn ? [distSelectedColumn] : []}
              onSelectionChange={(cols) => onDistSelectedColumnChange(cols[0] ?? null)}
              placeholder="Select column..."
            />
            {(distMode === 'box' || distMode === 'violin') && (
              <EDAColumnSelector
                columns={selectorColumns}
                selected={distCompareColumns}
                onSelectionChange={onDistCompareColumnsChange}
                multiple
                filterType="numeric"
                placeholder="Compare columns..."
              />
            )}
            <IconModeToggle
              value={distMode}
              onValueChange={(v) => { if (v) onDistModeChange(v as DistributionMode); }}
              options={DIST_MODE_OPTIONS}
            />
          </div>
        )}

        {activeTab === 'correlations' && (
          <IconModeToggle
            value={corrViewMode}
            onValueChange={(v) => {
              if (v === 'heatmap' || v === 'pairplot' || v === '3d') onCorrViewModeChange(v);
            }}
            className="ml-auto"
            options={[
              { value: 'heatmap', ariaLabel: 'Heatmap', icon: Grid3x3, tooltip: 'Correlation Heatmap' },
              { value: 'pairplot', ariaLabel: 'Pair Plot', icon: ScatterChart, tooltip: 'Pair Plot Matrix' },
              { value: '3d', ariaLabel: '3D', icon: Box, tooltip: numericCount < 3 ? 'Need 3+ numeric columns' : '3D Scatter' },
            ]}
          />
        )}
      </div>
    </div>
  );
}

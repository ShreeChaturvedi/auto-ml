/**
 * EDAToolbar — ribbon toolbar with inline dropdown nav + per-tab controls.
 * Renders into DataTable's toolbar slot when EDA view is active.
 */

import { createPortal } from 'react-dom';
import { Layers, BarChart3, Waypoints, Heart, Check, ChevronDown, BoxSelect, Activity, Grid3x3, ScatterChart, Box, TableIcon, ChartPie } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { EdaSummary } from '@/types/file';
import type { EdaTab } from './EDAPanel';
import { EDAColumnSelector } from './EDAColumnSelector';
import { IconModeToggle } from '../IconModeToggle';

type DistributionMode = 'histogram' | 'box' | 'violin';
type ViewMode = 'heatmap' | 'pairplot' | '3d';

const TAB_ITEMS: Array<{ id: EdaTab; label: string; icon: typeof Layers }> = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'distributions', label: 'Distributions', icon: BarChart3 },
  { id: 'correlations', label: 'Relationships', icon: Waypoints },
  { id: 'quality', label: 'Quality', icon: Heart },
];

interface EDAToolbarProps {
  eda: EdaSummary;
  activeTab: EdaTab;
  onActiveTabChange: (tab: EdaTab) => void;
  selectorColumns: Array<{ name: string; type: import('@/types/file').DataQualitySummary['dataType'] }>;
  numericColumnNames: string[];
  distSelectedColumn: string | null;
  onDistSelectedColumnChange: (col: string | null) => void;
  distMode: DistributionMode;
  onDistModeChange: (mode: DistributionMode) => void;
  distCompareColumns: string[];
  onDistCompareColumnsChange: (cols: string[]) => void;
  corrViewMode: ViewMode;
  onCorrViewModeChange: (v: ViewMode) => void;
  edaView: 'table' | 'eda';
  onEdaViewChange: (view: 'table' | 'eda') => void;
  controlsPortalTarget?: HTMLElement | null;
}

export function EDAToolbar({
  eda,
  activeTab,
  onActiveTabChange,
  selectorColumns,
  numericColumnNames,
  distSelectedColumn,
  onDistSelectedColumnChange,
  distMode,
  onDistModeChange,
  distCompareColumns,
  onDistCompareColumnsChange,
  corrViewMode,
  onCorrViewModeChange,
  edaView,
  onEdaViewChange,
  controlsPortalTarget,
}: EDAToolbarProps) {
  const hasNumeric = (eda.numericColumns?.length ?? 0) > 0;
  const hasCategorical = (eda.categoricalColumns?.length ?? 0) > 0;
  const hasCorrelations = (eda.correlations?.length ?? 0) > 0;
  const hasQuality = (eda.dataQuality?.length ?? 0) > 0;

  const isDisabled: Record<EdaTab, boolean> = {
    overview: false,
    distributions: !hasNumeric && !hasCategorical,
    correlations: !hasCorrelations,
    quality: !hasQuality,
  };

  const ActiveIcon = TAB_ITEMS.find((t) => t.id === activeTab)?.icon ?? Layers;

  const controls = (
    <div className="relative flex h-7 w-full min-w-0 items-center overflow-hidden">
      <div className="flex max-w-full min-w-0 items-center gap-2 overflow-hidden">
        {/* Tab dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1.5 shrink-0"
            >
              <ActiveIcon className="h-3.5 w-3.5" />
              {TAB_ITEMS.find((t) => t.id === activeTab)?.label}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {TAB_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.id}
                disabled={isDisabled[item.id]}
                onClick={() => onActiveTabChange(item.id)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-2">
                  <item.icon className={cn('h-3.5 w-3.5', activeTab === item.id ? 'text-primary' : 'text-muted-foreground')} />
                  {item.label}
                </span>
                {activeTab === item.id && <Check className="h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Per-tab controls */}
        {activeTab === 'distributions' && (
          <>
            <EDAColumnSelector
              columns={selectorColumns}
              selected={distSelectedColumn ? [distSelectedColumn] : []}
              onSelectionChange={(cols) => onDistSelectedColumnChange(cols[0] ?? null)}
              placeholder="Select column..."
            />
            <ToggleGroup
              type="single"
              size="sm"
              value={distMode}
              onValueChange={(val) => { if (val) onDistModeChange(val as DistributionMode); }}
            >
              <ToggleGroupItem value="histogram" aria-label="Histogram">
                <BarChart3 className="mr-1 h-3.5 w-3.5" />
                Histogram
              </ToggleGroupItem>
              <ToggleGroupItem value="box" aria-label="Box plot">
                <BoxSelect className="mr-1 h-3.5 w-3.5" />
                Box
              </ToggleGroupItem>
              <ToggleGroupItem value="violin" aria-label="Violin plot">
                <Activity className="mr-1 h-3.5 w-3.5" />
                Violin
              </ToggleGroupItem>
            </ToggleGroup>
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
          </>
        )}

        {activeTab === 'correlations' && (
          <IconModeToggle
            value={corrViewMode}
            onValueChange={(v) => {
              if (v === 'heatmap' || v === 'pairplot' || v === '3d') onCorrViewModeChange(v);
            }}
            options={[
              { value: 'heatmap', ariaLabel: 'Heatmap', icon: Grid3x3, tooltip: 'Correlation Heatmap' },
              { value: 'pairplot', ariaLabel: 'Pair Plot', icon: ScatterChart, tooltip: 'Pair Plot Matrix' },
              { value: '3d', ariaLabel: '3D', icon: Box, tooltip: numericColumnNames.length < 3 ? 'Need 3+ numeric columns' : '3D Scatter' },
            ]}
          />
        )}
      </div>

      {/* Far right: table/eda toggle */}
      <IconModeToggle
        value={edaView}
        onValueChange={(val) => {
          if (val === 'table' || val === 'eda') onEdaViewChange(val);
        }}
        className="ml-auto shrink-0"
        options={[
          { value: 'table', ariaLabel: 'Table view', icon: TableIcon, tooltip: 'Table' },
          { value: 'eda', ariaLabel: 'Analysis view', icon: ChartPie, tooltip: 'Analysis' },
        ]}
      />
    </div>
  );

  if (controlsPortalTarget) {
    return createPortal(
      <TooltipProvider delayDuration={300}>{controls}</TooltipProvider>,
      controlsPortalTarget,
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="shrink-0 border-b bg-muted/30 px-4 py-2.5">
        {controls}
      </div>
    </TooltipProvider>
  );
}

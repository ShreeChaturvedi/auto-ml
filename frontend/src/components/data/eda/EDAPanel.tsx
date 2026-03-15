/**
 * EDAPanel — Main orchestrator for the Exploratory Data Analysis view.
 * Wires together four tabs: Overview, Distributions, Correlations, Quality.
 * All cross-tab selection state is lifted here so it persists across switches.
 */

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, GitBranch, Layers, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EdaSummary } from '@/types/file';

// Insights
import { detectInsights } from './edaInsights';
import { InsightTicker } from '@/components/ui/insight-ticker';

// Overview tab components
import { OverviewKpiRow } from './OverviewKpiRow';
import { OverviewColumnCards } from './OverviewColumnCards';

// Distributions tab
import { DistributionsPanel } from './DistributionsPanel';

// Correlations tab
import { CorrelationsPanel } from './CorrelationsPanel';

// Quality tab
import { QualityPanel } from './QualityPanel';

interface EDAPanelProps {
  eda: EdaSummary;
  rows?: Record<string, unknown>[];
  className?: string;
}

export function EDAPanel({ eda, rows, className }: EDAPanelProps) {
  // ---------------------------------------------------------------------------
  // Local state (no Zustand — everything lives here)
  // ---------------------------------------------------------------------------

  const [activeTab, setActiveTab] = useState<string>('overview');

  // Distributions tab (lifted so state persists across tab switches)
  const [distSelectedColumn, setDistSelectedColumn] = useState<string | null>(null);
  const [distCompareColumns, setDistCompareColumns] = useState<string[]>([]);
  const [distMode, setDistMode] = useState<'histogram' | 'box' | 'violin'>('histogram');

  // Correlations tab
  const [corrSelectedCell, setCorrSelectedCell] = useState<{ a: string; b: string } | null>(null);

  // ---------------------------------------------------------------------------
  // Computed / derived values
  // ---------------------------------------------------------------------------

  const insights = useMemo(() => detectInsights(eda), [eda]);

  const numericColumns = eda.numericColumns ?? [];
  const categoricalColumns = eda.categoricalColumns ?? [];
  const dataQuality = eda.dataQuality ?? [];
  const correlations = eda.correlations ?? [];

  const hasNumeric = numericColumns.length > 0;
  const hasCategorical = categoricalColumns.length > 0;
  const hasCorrelations = correlations.length > 0;
  const hasQuality = dataQuality.length > 0;

  // KPI values
  const totalRows = dataQuality[0]?.totalCount ?? 0;
  const totalColumns = dataQuality.length;
  const completenessPercent =
    dataQuality.length > 0
      ? dataQuality.reduce((sum, d) => sum + (100 - d.missingPercentage), 0) / dataQuality.length
      : 100;
  const strongCorrelations = correlations.filter((c) => Math.abs(c.coefficient) > 0.7).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn('p-4', className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" className="gap-1.5 text-xs">
            <Layers className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="distributions"
            className="gap-1.5 text-xs"
            disabled={!hasNumeric && !hasCategorical}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Distributions
          </TabsTrigger>
          <TabsTrigger
            value="correlations"
            className="gap-1.5 text-xs"
            disabled={!hasCorrelations}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Correlations
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5 text-xs" disabled={!hasQuality}>
            <ShieldCheck className="h-3.5 w-3.5" />
            Quality
          </TabsTrigger>
        </TabsList>

        {/* ---- Overview ---- */}
        <TabsContent value="overview" className="mt-0">
          <div className="space-y-4">
            {/* Insight ticker */}
            {insights.length > 0 && (
              <InsightTicker
                items={insights.map((i) => ({ icon: i.icon, text: i.text, severity: i.severity }))}
                className="mb-2"
              />
            )}

            {/* KPI row */}
            <OverviewKpiRow
              totalRows={totalRows}
              totalColumns={totalColumns}
              completenessPercent={completenessPercent}
              strongCorrelations={strongCorrelations}
              insightCount={insights.length}
            />

            {/* Column cards grid */}
            <OverviewColumnCards eda={eda} />

            {/* Empty state */}
            {!hasNumeric && !hasCategorical && (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm font-medium">No analyzable columns found</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---- Distributions ---- */}
        <TabsContent value="distributions" className="mt-0">
          <DistributionsPanel
            eda={eda}
            selectedColumn={distSelectedColumn}
            onSelectedColumnChange={setDistSelectedColumn}
            compareColumns={distCompareColumns}
            onCompareColumnsChange={setDistCompareColumns}
            mode={distMode}
            onModeChange={setDistMode}
          />
        </TabsContent>

        {/* ---- Correlations ---- */}
        <TabsContent value="correlations" className="mt-0">
          <CorrelationsPanel
            eda={eda}
            rows={rows}
            selectedCell={corrSelectedCell}
            onSelectedCellChange={setCorrSelectedCell}
          />
        </TabsContent>

        {/* ---- Quality ---- */}
        <TabsContent value="quality" className="mt-0">
          <QualityPanel eda={eda} insights={insights} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

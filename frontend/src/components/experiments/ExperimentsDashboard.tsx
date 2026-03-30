import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { ModelDetailPanel } from './ModelDetailPanel';
import { EmptyState } from './views/EmptyState';
import { ComparisonMode } from './views/ComparisonMode';
import { LeaderboardMode } from './views/LeaderboardMode';
import { OverviewMode } from './views/OverviewMode';
import { formatMetric, PRIMARY_METRIC } from './utils';
import type { ReportPaneHandle } from './ReportPane';
import './experiments.css';

export function ExperimentsDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const refreshModels = useModelStore((s) => s.refreshModels);
  const models = useModelStore((s) => s.models);
  const isLoadingModels = useModelStore((s) => s.isLoadingModels);
  const selectedModelId = useExperimentsStore((s) => s.selectedModelId);
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const selectModel = useExperimentsStore((s) => s.selectModel);
  const clearComparison = useExperimentsStore((s) => s.clearComparison);
  const fetchProjectInsight = useExperimentsStore((s) => s.fetchProjectInsight);
  const experimentView = useExperimentsStore((s) => s.experimentView);
  const setExperimentView = useExperimentsStore((s) => s.setExperimentView);
  const activePredicates = useExperimentsStore((s) => s.activePredicates);
  const manualPredicates = useExperimentsStore((s) => s.manualPredicates);
  const removeManualPredicate = useExperimentsStore((s) => s.removeManualPredicate);
  const clearManualPredicates = useExperimentsStore((s) => s.clearManualPredicates);
  const setNlFilter = useExperimentsStore((s) => s.setNlFilter);
  const clearFilter = useExperimentsStore((s) => s.clearFilter);
  const comparisonRequested = useExperimentsStore((s) => s.comparisonRequested);
  const exitComparison = useExperimentsStore((s) => s.stopComparison);

  const prevModelCount = useRef(models.length);
  const reportPaneRef = useRef<ReportPaneHandle>(null);

  // Stable model-membership key for triggering insight refresh
  const modelIdKey = useMemo(
    () => models.map((m) => m.modelId).sort().join(','),
    [models]
  );

  // Fetch models on mount
  useEffect(() => {
    if (projectId) void refreshModels(projectId);
  }, [projectId, refreshModels]);

  // Post-training toast
  useEffect(() => {
    if (models.length > prevModelCount.current && prevModelCount.current > 0) {
      const newest = models[models.length - 1];
      if (newest) {
        const primaryKey = PRIMARY_METRIC[newest.taskType];
        const metricVal = newest.metrics[primaryKey];
        const formatted = formatMetric(metricVal);
        const metricStr = formatted !== '\u2014' ? ` \u2014 ${primaryKey} ${formatted}` : '';
        toast.success(`Model ${newest.name} trained${metricStr}`, {
          action: { label: 'View', onClick: () => selectModel(newest.modelId) },
        });
      }
    }
    prevModelCount.current = models.length;
  }, [models.length, models, selectModel]);

  // Trigger project insight when model membership changes (debounced to prevent
  // rapid LLM calls during seeding, deletion, or hyperparameter tuning)
  useEffect(() => {
    if (!modelIdKey || !projectId) return;
    const timer = setTimeout(() => {
      void fetchProjectInsight(projectId, models);
    }, 5_000);
    return () => clearTimeout(timer);
  }, [modelIdKey, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const removePredicate = useCallback(
    (index: number) => {
      const next = activePredicates.filter((_, i) => i !== index);
      if (next.length === 0) clearFilter();
      else setNlFilter('', next);
    },
    [activePredicates, clearFilter, setNlFilter]
  );

  const handleCardClick = useCallback((sectionSlug: string) => {
    reportPaneRef.current?.scrollToSection(sectionSlug);
  }, []);

  const handleViewChange = useCallback(
    (val: string) => {
      if (val === 'overview' || val === 'leaderboard') setExperimentView(val);
    },
    [setExperimentView]
  );

  const isEmpty = models.length === 0 && !isLoadingModels;
  const isComparing = comparisonRequested && comparisonModelIds.length >= 2;
  const isOverview = !isComparing && experimentView === 'overview';

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* ── Empty state ── */}
      {isEmpty && <EmptyState projectId={projectId ?? ''} />}

      {/* ── Comparison mode ── */}
      {!isEmpty && isComparing && (
        <ComparisonMode
          comparisonModelCount={comparisonModelIds.length}
          onExitComparison={exitComparison}
          onClearComparison={clearComparison}
        />
      )}

      {/* ── Leaderboard mode ── */}
      {!isEmpty && !isComparing && experimentView === 'leaderboard' && (
        <LeaderboardMode
          experimentView={experimentView}
          activePredicates={activePredicates}
          manualPredicates={manualPredicates}
          onViewChange={handleViewChange}
          onRemoveNlPredicate={removePredicate}
          onClearNlFilter={clearFilter}
          onRemoveManualPredicate={removeManualPredicate}
          onClearManualPredicates={clearManualPredicates}
        />
      )}

      {/* ── Overview mode ── */}
      {!isEmpty && isOverview && (
        <OverviewMode
          ref={reportPaneRef}
          onCardClick={handleCardClick}
          experimentView={experimentView}
          onViewChange={handleViewChange}
        />
      )}

      <ModelDetailPanel
        modelId={selectedModelId}
        open={selectedModelId !== null}
        onClose={() => selectModel(null)}
      />
    </div>
  );
}

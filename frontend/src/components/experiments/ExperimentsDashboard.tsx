import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { GitCompareArrows, LayoutDashboard, ListFilter, Table2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { IconModeToggle } from '@/components/data/IconModeToggle';
import { Leaderboard } from './Leaderboard';
import { ModelDetailPanel } from './ModelDetailPanel';
import { ComparisonView } from './ComparisonView';
import { OverviewDashboard } from './OverviewDashboard';
import { ReportPane, type ReportPaneHandle } from './ReportPane';
import { NlFilterBar } from './NlFilterBar';
import { formatMetric, formatOperator, PRIMARY_METRIC } from './utils';
import { cn } from '@/lib/utils';
import './experiments.css';

const VIEW_OPTIONS = [
  { value: 'overview', ariaLabel: 'Overview', icon: LayoutDashboard, tooltip: 'Overview' },
  { value: 'leaderboard', ariaLabel: 'Leaderboard', icon: Table2, tooltip: 'Leaderboard' },
] as const;

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
  const setNlFilter = useExperimentsStore((s) => s.setNlFilter);
  const clearFilter = useExperimentsStore((s) => s.clearFilter);

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
  const isComparing = comparisonModelIds.length >= 2;
  const isOverview = !isComparing && experimentView === 'overview';

  /* ── Filter chips (shared renderer) ── */
  const filterChips = activePredicates.length > 0 && !isComparing && (
    <div className="flex flex-wrap items-center gap-2 px-1 py-2 shrink-0">
      <ListFilter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {activePredicates.map((pred, i) => (
        <div
          key={`${pred.field}-${pred.operator}-${pred.value}-${i}`}
          className="group/chip relative isolate inline-flex items-center rounded-md border border-border/60 bg-muted/30 text-muted-foreground overflow-hidden transition-colors hover:bg-muted/60 hover:text-foreground hover:border-border"
        >
          <span
            className={cn(
              'px-2.5 py-1 text-xs whitespace-nowrap select-none',
              'group-hover/chip:[mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_36px),transparent_calc(100%_-_24px),transparent_100%)]',
              'group-hover/chip:[-webkit-mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_36px),transparent_calc(100%_-_24px),transparent_100%)]',
            )}
          >
            {pred.field} {formatOperator(pred.operator)} {pred.value}
          </span>
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex items-center justify-center w-7 opacity-0 pointer-events-none transition-opacity duration-200 group-hover/chip:opacity-100 group-hover/chip:pointer-events-auto text-muted-foreground hover:text-foreground"
            onClick={() => removePredicate(i)}
            aria-label={`Remove filter: ${pred.field} ${formatOperator(pred.operator)} ${pred.value}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ml-1 px-2 py-1 text-xs text-muted-foreground rounded-md transition-colors hover:bg-muted/50 hover:text-foreground"
        onClick={clearFilter}
      >
        Clear all
      </button>
    </div>
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      {/* ── Empty state ── */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center relative">
          <div className="relative z-10 text-center space-y-3 px-4 empty-state-enter">
            <svg width="200" height="150" viewBox="0 0 200 150" fill="none" className="mx-auto opacity-40" aria-hidden="true">
              {Array.from({ length: 7 }).map((_, xi) =>
                Array.from({ length: 5 }).map((_, yi) => (
                  <circle key={`${xi}-${yi}`} cx={40 + xi * 24} cy={15 + yi * 24} r="1" fill="currentColor" opacity="0.3" />
                ))
              )}
              <line x1="40" y1="130" x2="40" y2="10" stroke="currentColor" strokeWidth="1.5" />
              <polyline points="36,18 40,10 44,18" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <line x1="30" y1="120" x2="185" y2="120" stroke="currentColor" strokeWidth="1.5" />
              <polyline points="177,116 185,120 177,124" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="40" cy="120" r="3" fill="currentColor" opacity="0.6" />
            </svg>
            <p className="text-sm text-muted-foreground">
              Train your first model in the{' '}
              <Link
                to={`/project/${projectId}/training`}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Training phase
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* ── Comparison mode (full-width, own ribbon) ── */}
      {!isEmpty && isComparing && (
        <>
          <div className="flex h-14 items-center gap-3 border-b px-3 shrink-0">
            <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">Comparing {comparisonModelIds.length} Models</span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={clearComparison}>
              Clear
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearComparison} title="Exit comparison">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <ComparisonView />
          </div>
        </>
      )}

      {/* ── Leaderboard mode (full-width, single ribbon) ── */}
      {!isEmpty && !isComparing && experimentView === 'leaderboard' && (
        <>
          <div className="flex h-14 items-center gap-3 border-b px-3 shrink-0">
            <NlFilterBar />
            <IconModeToggle
              value={experimentView}
              onValueChange={handleViewChange}
              options={VIEW_OPTIONS}
            />
          </div>
          {filterChips && (
            <div className="border-b px-3">{filterChips}</div>
          )}
          <div className="flex-1 min-h-0">
            <Leaderboard />
          </div>
        </>
      )}

      {/* ── Overview mode (2-column split) ── */}
      {!isEmpty && isOverview && (
        <div className="flex h-full overflow-hidden">
          {/* Left column */}
          <div className="flex flex-col min-w-0 flex-1">
            {/* Left ribbon */}
            <div className="flex h-14 items-center gap-3 border-b px-3 shrink-0">
              <NlFilterBar />
            </div>
            {/* Left content */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <OverviewDashboard onCardClick={handleCardClick} />
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col min-w-0 w-full lg:w-[55%] lg:min-w-[360px] border-t lg:border-t-0 lg:border-l border-border">
            <ReportPane
              ref={reportPaneRef}
              experimentView={experimentView}
              onViewChange={handleViewChange}
            />
          </div>
        </div>
      )}

      <ModelDetailPanel
        modelId={selectedModelId}
        open={selectedModelId !== null}
        onClose={() => selectModel(null)}
      />
    </div>
  );
}

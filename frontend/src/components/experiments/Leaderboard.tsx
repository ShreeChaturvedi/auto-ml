import { useMemo, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CircleStar, ChevronRight, GitCompareArrows, X, ListFilter } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import type { ModelRecord, ModelTaskType } from '@/types/model';
import { cn } from '@/lib/utils';
import { SortHeader } from '@/components/ui/SortHeader';
import { LOWER_IS_BETTER } from './modelIcons';
import { NlFilterBar } from './NlFilterBar';
import { formatMetric, formatOperator, filterByPredicates, PRIMARY_METRIC, detectTaskTypes } from './utils';

/* ── Metric helpers ─────────────────────────────────────── */

/** Columns per task type: [label, metricKey]. */
const METRIC_COLUMNS: Record<ModelTaskType, [string, string][]> = {
  classification: [
    ['Accuracy', 'accuracy'],
    ['Precision', 'precision'],
    ['Recall', 'recall'],
    ['F1', 'f1'],
  ],
  regression: [
    ['RMSE', 'rmse'],
    ['MAE', 'mae'],
    ['R\u00B2', 'r2'],
  ],
  clustering: [
    ['Silhouette', 'silhouette'],
  ],
};

/** Build metric columns: all columns for dominant type first, then primary for others. */
function buildSmartColumns(taskTypes: ModelTaskType[], models: ModelRecord[]): [string, string][] {
  if (taskTypes.length === 0) return [];

  // Find the dominant task type (most models)
  const counts = new Map<ModelTaskType, number>();
  for (const m of models) counts.set(m.taskType, (counts.get(m.taskType) ?? 0) + 1);
  const sorted = [...taskTypes].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const dominant = sorted[0];

  // Show ALL columns for dominant type first
  const cols: [string, string][] = [];
  const seen = new Set<string>();
  for (const col of METRIC_COLUMNS[dominant]) {
    seen.add(col[1]);
    cols.push(col);
  }

  // Then add primary metric for minority types (cap at 6)
  for (const tt of sorted.slice(1)) {
    if (cols.length >= 6) break;
    const primary = PRIMARY_METRIC[tt];
    const col = METRIC_COLUMNS[tt].find(([, key]) => key === primary);
    if (col && !seen.has(col[1])) { seen.add(col[1]); cols.push(col); }
  }
  return cols;
}

/** Champion is the model with the highest primary metric among completed models. */
function findChampionId(models: ModelRecord[]): string | null {
  let best: ModelRecord | null = null;
  let bestVal = -Infinity;
  for (const m of models) {
    if (m.status !== 'completed') continue;
    const primary = PRIMARY_METRIC[m.taskType];
    const val = m.metrics[primary] ?? -Infinity;
    if (val > bestVal) {
      bestVal = val;
      best = m;
    }
  }
  return best?.modelId ?? null;
}


/* ── Skeleton ghost rows ───────────────────────────────── */

function GhostRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i} className="opacity-[0.04]">
          <td className="p-2"><div className="timeline-skeleton h-4 w-4 rounded" /></td>
          <td className="p-2"><div className="timeline-skeleton h-4 w-24 rounded" /></td>
          <td className="p-2"><div className="timeline-skeleton h-4 w-16 rounded" /></td>
          <td className="p-2"><div className="timeline-skeleton h-4 w-12 rounded" /></td>
          <td className="p-2"><div className="timeline-skeleton h-4 w-12 rounded" /></td>
        </tr>
      ))}
    </>
  );
}

/* ── Leaderboard component ─────────────────────────────── */

export function Leaderboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const models = useModelStore((s) => s.models);
  const isLoadingModels = useModelStore((s) => s.isLoadingModels);

  const selectedModelId = useExperimentsStore((s) => s.selectedModelId);
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const selectModel = useExperimentsStore((s) => s.selectModel);
  const toggleComparison = useExperimentsStore((s) => s.toggleComparison);
  const clearComparison = useExperimentsStore((s) => s.clearComparison);
  const activePredicates = useExperimentsStore((s) => s.activePredicates);
  const sortField = useExperimentsStore((s) => s.sortField);
  const sortDirection = useExperimentsStore((s) => s.sortDirection);
  const setSort = useExperimentsStore((s) => s.setSort);
  const clearFilter = useExperimentsStore((s) => s.clearFilter);
  const setNlFilter = useExperimentsStore((s) => s.setNlFilter);

  const { themeColorClass: trophyColorClass } = useProjectThemeColor();
  const taskTypes = useMemo(() => detectTaskTypes(models), [models]);
  const metricCols = useMemo(() => buildSmartColumns(taskTypes, models), [taskTypes, models]);
  const championId = useMemo(() => findChampionId(models), [models]);

  const filteredModels = useMemo(
    () => filterByPredicates(models, activePredicates),
    [models, activePredicates]
  );

  const sortedModels = useMemo(() => {
    const sorted = [...filteredModels];
    sorted.sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      if (sortField === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortField === 'algorithm') {
        aVal = a.algorithm.toLowerCase();
        bVal = b.algorithm.toLowerCase();
      } else if (sortField === 'createdAt') {
        aVal = a.createdAt;
        bVal = b.createdAt;
      } else {
        // metric field
        aVal = a.metrics[sortField] ?? -Infinity;
        bVal = b.metrics[sortField] ?? -Infinity;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredModels, sortField, sortDirection]);

  const metricExtremes = useMemo(() => {
    const result: Record<string, { best: number; worst: number }> = {};
    for (const [, key] of metricCols) {
      const values = sortedModels
        .map((m) => m.metrics[key])
        .filter((v): v is number => v != null && Number.isFinite(v));
      if (values.length < 2) continue;
      const lower = LOWER_IS_BETTER.has(key);
      result[key] = {
        best: lower ? Math.min(...values) : Math.max(...values),
        worst: lower ? Math.max(...values) : Math.min(...values),
      };
    }
    return result;
  }, [sortedModels, metricCols]);

  const handleSort = useCallback(
    (field: string) => {
      if (sortField === field) {
        setSort(field, sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSort(field, 'desc');
      }
    },
    [sortField, sortDirection, setSort]
  );

  const isEmpty = models.length === 0 && !isLoadingModels;

  const removePredicate = useCallback(
    (index: number) => {
      const next = activePredicates.filter((_, i) => i !== index);
      if (next.length === 0) {
        clearFilter();
      } else {
        setNlFilter('', next);
      }
    },
    [activePredicates, clearFilter, setNlFilter]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header — search integrated inline */}
      <div className="flex h-14 items-center gap-3 border-b px-3 shrink-0">
        {!isEmpty && <NlFilterBar />}
        <span className="text-[11px] text-muted-foreground shrink-0">{models.length} models</span>
      </div>

      {/* Active filter predicates */}
      {activePredicates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 shrink-0">
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
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {/* Ghost table behind the message */}
          <table className="w-full absolute inset-0">
            <tbody>
              <GhostRows />
            </tbody>
          </table>
          <div className="relative z-10 text-center space-y-3 px-4 empty-state-enter">
            {/* Coordinate plane SVG */}
            <svg
              width="200"
              height="150"
              viewBox="0 0 200 150"
              fill="none"
              className="mx-auto opacity-40"
              aria-hidden="true"
            >
              {/* Dotted grid */}
              {Array.from({ length: 7 }).map((_, xi) =>
                Array.from({ length: 5 }).map((_, yi) => (
                  <circle
                    key={`${xi}-${yi}`}
                    cx={40 + xi * 24}
                    cy={15 + yi * 24}
                    r="1"
                    fill="currentColor"
                    opacity="0.3"
                  />
                ))
              )}
              {/* Y axis */}
              <line x1="40" y1="130" x2="40" y2="10" stroke="currentColor" strokeWidth="1.5" />
              <polyline points="36,18 40,10 44,18" fill="none" stroke="currentColor" strokeWidth="1.5" />
              {/* X axis */}
              <line x1="30" y1="120" x2="185" y2="120" stroke="currentColor" strokeWidth="1.5" />
              <polyline points="177,116 185,120 177,124" fill="none" stroke="currentColor" strokeWidth="1.5" />
              {/* Origin dot */}
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

      {/* Table */}
      {!isEmpty && (
        <ScrollArea className="flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/40 backdrop-blur-sm z-10 border-b">
              <tr>
                <th className="w-8" />
                <SortHeader field="name" label="Name" sortField={sortField} sortDir={sortDirection} onToggle={handleSort} />
                <SortHeader field="algorithm" label="Algorithm" sortField={sortField} sortDir={sortDirection} onToggle={handleSort} />
                {metricCols.map(([label, key]) => (
                  <SortHeader key={key} field={key} label={label} sortField={sortField} sortDir={sortDirection} onToggle={handleSort} align="right" />
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {isLoadingModels && models.length === 0 && <GhostRows />}
              {sortedModels.map((model) => {
                const isSelected = model.modelId === selectedModelId;
                const isCompared = comparisonModelIds.includes(model.modelId);
                const isChampion = model.modelId === championId;

                return (
                  <tr
                    key={model.modelId}
                    className={cn(
                      'transition-colors cursor-pointer hover:bg-muted/30 group',
                      isSelected && 'bg-muted/70 model-row-selected',
                      isChampion && 'champion-row',
                      isCompared && 'ring-1 ring-inset ring-primary/20'
                    )}
                    onClick={() => selectModel(model.modelId)}
                  >
                    {/* Comparison checkbox */}
                    <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isCompared}
                        onCheckedChange={() => toggleComparison(model.modelId)}
                        className="h-3.5 w-3.5"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-left font-semibold truncate max-w-[180px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate block">
                            {isChampion && (
                              <CircleStar
                                className={cn("h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5 shrink-0", trophyColorClass)}
                              />
                            )}
                            {model.name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{isChampion ? 'Champion — ' : ''}{model.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-2.5 px-3 text-left text-muted-foreground truncate max-w-[130px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate block">{model.algorithm}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{model.algorithm}</p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    {metricCols.map(([, key]) => {
                      const val = model.metrics[key];
                      const extremes = metricExtremes[key];
                      const isBest = extremes && val === extremes.best;
                      const isWorst = extremes && val === extremes.worst;
                      return (
                        <td
                          key={key}
                          className={cn(
                            'py-2.5 px-3 text-right tabular-nums font-medium',
                            isBest && 'text-emerald-500 dark:text-emerald-400 font-semibold',
                            isWorst && 'text-red-500/70 dark:text-red-400/70',
                          )}
                        >
                          {formatMetric(val)}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-1 text-right">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity inline-block" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {comparisonModelIds.length > 0 && (
        <div className="flex h-11 items-center justify-between border-t px-3 shrink-0 bg-muted/30 bulk-action-enter">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium">{comparisonModelIds.length} selected</span>
            {comparisonModelIds.length === 1 && (
              <span className="text-[11px] text-muted-foreground">— select 1 more to compare</span>
            )}
            {comparisonModelIds.length >= 2 && (
              <span className="text-[11px] text-muted-foreground">— viewing comparison</span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={clearComparison}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

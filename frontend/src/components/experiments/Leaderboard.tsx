import { useMemo, useCallback } from 'react';
import { CircleStar, ChevronRight, GitCompareArrows } from 'lucide-react';
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
import { formatMetric, filterByPredicates, PRIMARY_METRIC, detectTaskTypes } from './utils';

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

  const counts = new Map<ModelTaskType, number>();
  for (const m of models) counts.set(m.taskType, (counts.get(m.taskType) ?? 0) + 1);
  const sorted = [...taskTypes].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const dominant = sorted[0];

  const cols: [string, string][] = [];
  const seen = new Set<string>();
  for (const col of METRIC_COLUMNS[dominant]) {
    seen.add(col[1]);
    cols.push(col);
  }

  for (const tt of sorted.slice(1)) {
    if (cols.length >= 6) break;
    const primary = PRIMARY_METRIC[tt];
    const col = METRIC_COLUMNS[tt].find(([, key]) => key === primary);
    if (col && !seen.has(col[1])) { seen.add(col[1]); cols.push(col); }
  }
  return cols;
}

/** Champion is the model with the best primary metric among completed models. */
function findChampionId(models: ModelRecord[]): string | null {
  let best: ModelRecord | null = null;
  let bestVal = NaN;
  for (const m of models) {
    if (m.status !== 'completed') continue;
    const primary = PRIMARY_METRIC[m.taskType];
    const val = m.metrics[primary];
    if (val == null || !Number.isFinite(val)) continue;
    const lower = LOWER_IS_BETTER.has(primary);
    if (Number.isNaN(bestVal) || (lower ? val < bestVal : val > bestVal)) {
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
        <tr key={i} className="opacity-[0.08]">
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

  const { themeColorClass: trophyColorClass, colorClasses } = useProjectThemeColor();
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

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <ScrollArea className="flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card/80 backdrop-blur-md z-10 border-b border-border/20">
            <tr>
              <th scope="col" className="w-8" />
              <SortHeader field="name" label="Name" sortField={sortField} sortDir={sortDirection} onToggle={handleSort} />
              <SortHeader field="algorithm" label="Algorithm" sortField={sortField} sortDir={sortDirection} onToggle={handleSort} />
              {metricCols.map(([label, key]) => (
                <SortHeader key={key} field={key} label={label} sortField={sortField} sortDir={sortDirection} onToggle={handleSort} align="right" />
              ))}
              <th scope="col" className="w-8" />
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
                    'transition-colors cursor-pointer border-b border-border/10 hover:bg-muted/20 group',
                    isSelected && [
                      'bg-muted/40 border-l-2',
                      colorClasses?.borderAccent ?? 'border-primary',
                    ],
                    isChampion && !isSelected && 'bg-muted/10',
                    isCompared && 'ring-1 ring-inset ring-primary/20'
                  )}
                  tabIndex={0}
                  onClick={() => selectModel(model.modelId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectModel(model.modelId);
                    }
                  }}
                >
                  <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isCompared}
                      onCheckedChange={() => toggleComparison(model.modelId)}
                      className="h-3.5 w-3.5 group-hover:ring-1 group-hover:ring-muted-foreground/20 transition-shadow"
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
                          'py-2.5 px-3 text-right tabular-nums font-medium text-foreground/80',
                          isBest && 'text-emerald-400 font-semibold',
                          isWorst && 'text-red-400/50',
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

      {comparisonModelIds.length > 0 && (
        <div className="flex h-11 items-center justify-between border-t border-border/20 px-3 shrink-0 bg-card bulk-action-enter">
          <div className="flex items-center gap-2.5">
            <GitCompareArrows className="h-3 w-3 text-muted-foreground" />
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted/60 rounded-full px-2.5 py-0.5">
              <span className="tabular-nums">{comparisonModelIds.length}</span> selected
            </span>
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

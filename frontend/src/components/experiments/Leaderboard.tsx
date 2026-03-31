import { useMemo, useCallback, useEffect } from 'react';
import { CircleStar, ChevronRight, Tag, Hash } from 'lucide-react';
import Papa from 'papaparse';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import type { ModelRecord, ModelTaskType } from '@/types/model';
import { cn, downloadBlob } from '@/lib/utils';
import { SortHeader } from '@/components/ui/SortHeader';
import { LOWER_IS_BETTER } from './modelIcons';
import {
  filterModels,
  formatMetric,
  PRIMARY_METRIC,
  detectTaskTypes,
  findChampionModelId,
  sortModels,
} from './utils';
import type { ExperimentSortField } from '@/types/experiments';

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

interface LeaderboardProps {
  onExportReady?: (handler: (selectedOnly?: string[]) => void) => void;
}

export function Leaderboard({ onExportReady }: LeaderboardProps) {
  const models = useModelStore((s) => s.models);
  const isLoadingModels = useModelStore((s) => s.isLoadingModels);

  const selectedModelId = useExperimentsStore((s) => s.selectedModelId);
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const selectModel = useExperimentsStore((s) => s.selectModel);
  const toggleComparison = useExperimentsStore((s) => s.toggleComparison);
  const activePredicates = useExperimentsStore((s) => s.activePredicates);
  const sortField = useExperimentsStore((s) => s.sortField);
  const sortDirection = useExperimentsStore((s) => s.sortDirection);
  const setSort = useExperimentsStore((s) => s.setSort);
  const manualPredicates = useExperimentsStore((s) => s.manualPredicates);
  const nameFilter = useExperimentsStore((s) => s.nameFilter);

  const trophyColorClass = 'text-accent-text';
  const taskTypes = useMemo(() => detectTaskTypes(models), [models]);
  const metricCols = useMemo(() => buildSmartColumns(taskTypes, models), [taskTypes, models]);
  const championId = useMemo(() => findChampionModelId(models), [models]);

  const filteredModels = useMemo(
    () => filterModels(models, activePredicates, manualPredicates, nameFilter),
    [models, activePredicates, manualPredicates, nameFilter]
  );

  const sortedModels = useMemo(
    () => sortModels(filteredModels, sortField, sortDirection),
    [filteredModels, sortField, sortDirection]
  );

  const metricExtremes = useMemo(() => {
    const result: Record<string, { best: number; worst: number }> = {};
    for (const [, key] of metricCols) {
      const values = filteredModels
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
  }, [filteredModels, metricCols]);

  const handleSort = useCallback(
    (field: ExperimentSortField) => {
      if (sortField === field) {
        setSort(field, sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSort(field, 'desc');
      }
    },
    [sortField, sortDirection, setSort]
  );

  const handleExport = useCallback(
    (selectedOnly?: string[]) => {
      const data = selectedOnly
        ? sortedModels.filter((m) => selectedOnly.includes(m.modelId))
        : sortedModels;
      if (data.length === 0) return;
      const metricKeys = metricCols.map(([, key]) => key);
      const rows = data.map((m) => ({
        name: m.name,
        algorithm: m.algorithm,
        taskType: m.taskType,
        status: m.status,
        ...Object.fromEntries(metricKeys.map((k) => [k, m.metrics[k] ?? ''])),
        createdAt: m.createdAt,
      }));
      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      downloadBlob(blob, `leaderboard-${timestamp}.csv`);
    },
    [sortedModels, metricCols],
  );

  useEffect(() => { onExportReady?.(handleExport); }, [onExportReady, handleExport]);

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <ScrollArea className="flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card/80 backdrop-blur-md z-20 border-b border-border/20">
            <tr>
              <th scope="col" className="w-8" />
              <SortHeader field="name" label="Name" sortField={sortField} sortDir={sortDirection} onToggle={handleSort} className="py-3" icon={Tag} />
              <SortHeader field="algorithm" label="Algorithm" sortField={sortField} sortDir={sortDirection} onToggle={handleSort} className="py-3" icon={Tag} />
              {metricCols.map(([label, key]) => (
                <SortHeader key={key} field={key} label={label} sortField={sortField} sortDir={sortDirection} onToggle={handleSort} align="right" className="py-3" icon={Hash} />
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
                    'transition-colors cursor-pointer border-b border-border/10 hover:bg-muted/50 group',
                    isSelected && [
                      'bg-muted/40 border-l-2',
                      'border-accent-fill',
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
                      className="h-3.5 w-3.5 group-hover:ring-1 group-hover:ring-muted-foreground/20 group-focus-within:ring-1 group-focus-within:ring-muted-foreground/20 transition-shadow"
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
                          isBest && 'text-metric-positive bg-metric-positive/8 dark:bg-metric-positive/12 font-semibold',
                          isWorst && 'text-metric-negative dark:bg-metric-negative/10',
                        )}
                      >
                        {formatMetric(val)}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-1 text-right">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 group-focus-within:opacity-60 transition-opacity inline-block" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>

      {sortedModels.length === 0 && (activePredicates.length > 0 || manualPredicates.length > 0 || nameFilter.trim()) && (
        <div className="flex items-center justify-center py-8">
          <p className="text-[11px] text-muted-foreground">No models match all active filters</p>
        </div>
      )}
    </div>
  );
}

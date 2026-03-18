import { useMemo, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Trophy, ArrowUp, ArrowDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import type { ModelRecord, ModelTaskType } from '@/types/model';
import { cn } from '@/lib/utils';
import { NlFilterBar } from './NlFilterBar';
import { formatMetric, filterByPredicates, PRIMARY_METRIC, detectTaskTypes } from './utils';
import { EvalStatusBadge } from './EvalStatusBadge';

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

/** Build combined metric column list (deduped by key). */
function buildMetricColumns(taskTypes: ModelTaskType[]): [string, string][] {
  const seen = new Set<string>();
  const cols: [string, string][] = [];
  for (const tt of taskTypes) {
    for (const col of METRIC_COLUMNS[tt]) {
      if (!seen.has(col[1])) {
        seen.add(col[1]);
        cols.push(col);
      }
    }
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
  const activePredicates = useExperimentsStore((s) => s.activePredicates);
  const sortField = useExperimentsStore((s) => s.sortField);
  const sortDirection = useExperimentsStore((s) => s.sortDirection);
  const setSort = useExperimentsStore((s) => s.setSort);

  const taskTypes = useMemo(() => detectTaskTypes(models), [models]);
  const metricCols = useMemo(() => buildMetricColumns(taskTypes), [taskTypes]);
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <Trophy className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Leaderboard</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {models.length} model{models.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* NL Filter */}
      {!isEmpty && <NlFilterBar />}

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
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background z-10 border-b">
              <tr>
                {/* Checkbox column */}
                <th className="w-8 p-2" />
                {/* Champion indicator */}
                <th className="w-6 p-2" />
                <th
                  className="p-2 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort('name')}
                >
                  Name {sortField === 'name' && (sortDirection === 'asc' ? <ArrowUp className="inline h-3 w-3 ml-0.5" /> : <ArrowDown className="inline h-3 w-3 ml-0.5" />)}
                </th>
                <th
                  className="p-2 text-left font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort('algorithm')}
                >
                  Algorithm {sortField === 'algorithm' && (sortDirection === 'asc' ? <ArrowUp className="inline h-3 w-3 ml-0.5" /> : <ArrowDown className="inline h-3 w-3 ml-0.5" />)}
                </th>
                {metricCols.map(([label, key]) => (
                  <th
                    key={key}
                    className="p-2 text-right font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort(key)}
                  >
                    {label} {sortField === key && (sortDirection === 'asc' ? <ArrowUp className="inline h-3 w-3 ml-0.5" /> : <ArrowDown className="inline h-3 w-3 ml-0.5" />)}
                  </th>
                ))}
                <th className="p-2 text-center font-medium text-muted-foreground whitespace-nowrap">Status</th>
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
                      'border-b border-border/40 transition-colors cursor-pointer hover:bg-muted/50',
                      isSelected && 'bg-muted/70 model-row-selected',
                      isChampion && 'champion-row',
                      isCompared && 'ring-1 ring-inset ring-primary/20'
                    )}
                    onClick={() => selectModel(model.modelId)}
                  >
                    {/* Comparison checkbox */}
                    <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isCompared}
                        onCheckedChange={() => toggleComparison(model.modelId)}
                        className="h-3.5 w-3.5"
                      />
                    </td>
                    {/* Champion trophy */}
                    <td className="p-2 text-center">
                      {isChampion && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Trophy className="h-3.5 w-3.5 text-amber-500 inline-block" />
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p className="text-xs">Champion model</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                    <td className="p-2 text-left font-medium truncate max-w-[140px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate block">{model.name}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{model.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="p-2 text-left text-muted-foreground truncate max-w-[100px]">
                      {model.algorithm}
                    </td>
                    {metricCols.map(([, key]) => (
                      <td key={key} className="p-2 text-right tabular-nums metric-counter">
                        {formatMetric(model.metrics[key])}
                      </td>
                    ))}
                    <td className="p-2 text-center">
                      <EvalStatusBadge status={model.evaluationStatus ?? model.status} compact />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}

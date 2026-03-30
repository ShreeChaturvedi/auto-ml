import { useMemo, useCallback, useState } from 'react';
import { Search, ChevronDown, ChevronRight, Plus, ListFilter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import type { FilterPredicate } from '@/types/experiments';
import { cn } from '@/lib/utils';

const OP_LABELS: Record<string, string> = { gte: '\u2265', lte: '\u2264', eq: '=' };

interface FilterPopoverProps {
  hasActiveFilters: boolean;
}

export function FilterPopover({ hasActiveFilters }: FilterPopoverProps) {
  const models = useModelStore((s) => s.models);
  const manualPredicates = useExperimentsStore((s) => s.manualPredicates);
  const setManualPredicates = useExperimentsStore((s) => s.setManualPredicates);
  const addManualPredicate = useExperimentsStore((s) => s.addManualPredicate);
  const nameFilter = useExperimentsStore((s) => s.nameFilter);
  const setNameFilter = useExperimentsStore((s) => s.setNameFilter);

  const [algoSearch, setAlgoSearch] = useState('');
  const [metricField, setMetricField] = useState('');
  const [metricOp, setMetricOp] = useState<'gte' | 'lte' | 'eq'>('gte');
  const [metricValue, setMetricValue] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Single pass over models to compute all category counts + available metrics
  const { taskTypeCounts, algorithmCounts, statusCounts, availableMetrics } = useMemo(() => {
    const tt: Record<string, number> = {};
    const algo: Record<string, number> = {};
    const st: Record<string, number> = {};
    const metricKeys = new Set<string>();
    for (const m of models) {
      tt[m.taskType] = (tt[m.taskType] ?? 0) + 1;
      algo[m.algorithm] = (algo[m.algorithm] ?? 0) + 1;
      st[m.status] = (st[m.status] ?? 0) + 1;
      for (const k of Object.keys(m.metrics)) metricKeys.add(k);
    }
    return {
      taskTypeCounts: tt,
      algorithmCounts: algo,
      statusCounts: st,
      availableMetrics: Array.from(metricKeys).sort(),
    };
  }, [models]);

  const filteredAlgorithms = useMemo(() => {
    const entries = Object.entries(algorithmCounts);
    if (!algoSearch.trim()) return entries;
    const q = algoSearch.toLowerCase();
    return entries.filter(([name]) => name.toLowerCase().includes(q));
  }, [algorithmCounts, algoSearch]);

  // Helper: get currently selected values for a field from manual predicates
  const getSelectedValues = useCallback(
    (field: string) => {
      return manualPredicates
        .filter((p) => p.field === field && p.operator === 'eq')
        .map((p) => String(p.value));
    },
    [manualPredicates],
  );

  // Helper: toggle a category value (OR within field, AND across fields)
  const toggleCategoryValue = useCallback(
    (field: string, value: string, checked: boolean) => {
      const otherPredicates = manualPredicates.filter(
        (p) => !(p.field === field && p.operator === 'eq'),
      );
      const currentValues = getSelectedValues(field);
      const newValues = checked
        ? [...currentValues, value]
        : currentValues.filter((v) => v !== value);
      const newPredicates: FilterPredicate[] = [
        ...otherPredicates,
        ...newValues.map((v) => ({ field, operator: 'eq' as const, value: v })),
      ];
      setManualPredicates(newPredicates);
    },
    [manualPredicates, getSelectedValues, setManualPredicates],
  );

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddMetricRange = () => {
    if (!metricField || !metricValue) return;
    const numVal = parseFloat(metricValue);
    if (!Number.isFinite(numVal)) return;
    addManualPredicate({ field: metricField, operator: metricOp, value: numVal });
    setMetricValue('');
  };

  const selectedTaskTypes = useMemo(() => getSelectedValues('taskType'), [getSelectedValues]);
  const selectedAlgorithms = useMemo(() => getSelectedValues('algorithm'), [getSelectedValues]);
  const selectedStatuses = useMemo(() => getSelectedValues('status'), [getSelectedValues]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <ListFilter
            className={cn('h-3.5 w-3.5', hasActiveFilters && 'text-accent-text')}
          />
          <span className="sr-only">Filter</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        {/* Name filter */}
        <div className="p-2 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter by name..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {/* Task Type */}
          {Object.keys(taskTypeCounts).length > 0 && (
            <div className="border-b border-border/40">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => toggleCollapse('taskType')}
              >
                {collapsed.taskType ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Task Type
              </button>
              {!collapsed.taskType && (
                <div className="px-3 pb-2 space-y-1.5">
                  {Object.entries(taskTypeCounts).map(([type, count]) => (
                    <label
                      key={type}
                      className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
                    >
                      <Checkbox
                        checked={selectedTaskTypes.includes(type)}
                        onCheckedChange={(checked) =>
                          toggleCategoryValue('taskType', type, !!checked)
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex-1 capitalize">{type}</span>
                      <span className="tabular-nums text-muted-foreground/60">
                        ({count})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Algorithm */}
          {Object.keys(algorithmCounts).length > 0 && (
            <div className="border-b border-border/40">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => toggleCollapse('algorithm')}
              >
                {collapsed.algorithm ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Algorithm
              </button>
              {!collapsed.algorithm && (
                <div className="px-3 pb-2 space-y-1.5">
                  <div className="relative mb-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Search algorithms..."
                      value={algoSearch}
                      onChange={(e) => setAlgoSearch(e.target.value)}
                      className="h-7 pl-7 text-xs"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {filteredAlgorithms.map(([algo, count]) => (
                      <label
                        key={algo}
                        className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
                      >
                        <Checkbox
                          checked={selectedAlgorithms.includes(algo)}
                          onCheckedChange={(checked) =>
                            toggleCategoryValue('algorithm', algo, !!checked)
                          }
                          className="h-3.5 w-3.5"
                        />
                        <span className="flex-1 truncate">{algo}</span>
                        <span className="tabular-nums text-muted-foreground/60">
                          ({count})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status */}
          {Object.keys(statusCounts).length > 0 && (
            <div className="border-b border-border/40">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => toggleCollapse('status')}
              >
                {collapsed.status ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Status
              </button>
              {!collapsed.status && (
                <div className="px-3 pb-2 space-y-1.5">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <label
                      key={status}
                      className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
                    >
                      <Checkbox
                        checked={selectedStatuses.includes(status)}
                        onCheckedChange={(checked) =>
                          toggleCategoryValue('status', status, !!checked)
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex-1 capitalize">{status}</span>
                      <span className="tabular-nums text-muted-foreground/60">
                        ({count})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Metric Range */}
          {availableMetrics.length > 0 && (
            <div>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => toggleCollapse('metric')}
              >
                {collapsed.metric ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Metric Range
              </button>
              {!collapsed.metric && (
                <div className="px-3 pb-2 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Select value={metricField} onValueChange={setMetricField}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Metric" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMetrics.map((m) => (
                          <SelectItem key={m} value={m} className="text-xs">
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={metricOp}
                      onValueChange={(v) => setMetricOp(v as 'gte' | 'lte' | 'eq')}
                    >
                      <SelectTrigger className="h-7 w-14 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(OP_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val} className="text-xs">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="any"
                      value={metricValue}
                      onChange={(e) => setMetricValue(e.target.value)}
                      className="h-7 w-16 text-xs"
                      placeholder="0.9"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddMetricRange();
                      }}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-xs gap-1"
                    onClick={handleAddMetricRange}
                    disabled={!metricField || !metricValue}
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

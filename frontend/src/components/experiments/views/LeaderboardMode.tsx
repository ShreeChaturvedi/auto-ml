import { useCallback, useRef } from 'react';
import { LayoutDashboard, Table2, Download } from 'lucide-react';
import type { FilterPredicate } from '@/types/experiments';
import { Leaderboard } from '../Leaderboard';
import { NlFilterBar } from '../NlFilterBar';
import { IconModeToggle } from '@/components/data/IconModeToggle';
import { FilterChips } from '../FilterChips';
import { FilterPopover } from '../FilterPopover';
import { BulkActionBar } from '../BulkActionBar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { cn } from '@/lib/utils';

const VIEW_OPTIONS = [
  { value: 'overview', ariaLabel: 'Overview', icon: LayoutDashboard, tooltip: 'Overview' },
  { value: 'leaderboard', ariaLabel: 'Leaderboard', icon: Table2, tooltip: 'Leaderboard' },
] as const;

interface LeaderboardModeProps {
  experimentView: string;
  activePredicates: FilterPredicate[];
  manualPredicates: FilterPredicate[];
  onViewChange: (val: string) => void;
  onRemoveNlPredicate: (index: number) => void;
  onClearNlFilter: () => void;
  onRemoveManualPredicate: (index: number) => void;
  onClearManualPredicates: () => void;
}

export function LeaderboardMode({
  experimentView,
  activePredicates,
  manualPredicates,
  onViewChange,
  onRemoveNlPredicate,
  onClearNlFilter,
  onRemoveManualPredicate,
  onClearManualPredicates,
}: LeaderboardModeProps) {
  const exportRef = useRef<((selectedOnly?: string[]) => void) | null>(null);
  const comparisonModelIds = useExperimentsStore((s) => s.comparisonModelIds);
  const nameFilter = useExperimentsStore((s) => s.nameFilter);
  const hasSelection = comparisonModelIds.length > 0;

  const handleExportReady = useCallback((handler: (selectedOnly?: string[]) => void) => {
    exportRef.current = handler;
  }, []);

  const handleExportAll = useCallback(() => { exportRef.current?.(); }, []);
  const handleExportSelected = useCallback(() => {
    exportRef.current?.(comparisonModelIds);
  }, [comparisonModelIds]);

  return (
    <>
      <div className="relative flex h-14 items-center border-b px-3 shrink-0">
        {/* Normal toolbar */}
        <div className={cn(
          'flex items-center gap-3 w-full transition-opacity duration-150',
          hasSelection ? 'opacity-0 pointer-events-none absolute inset-x-3 inset-y-0 items-center' : 'opacity-100',
        )}>
          <NlFilterBar />
          <FilterPopover hasActiveFilters={manualPredicates.length > 0 || nameFilter.trim().length > 0} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExportAll}>
                <Download className="h-3.5 w-3.5" />
                <span className="sr-only">Export CSV</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export CSV</TooltipContent>
          </Tooltip>
          <IconModeToggle value={experimentView} onValueChange={onViewChange} options={VIEW_OPTIONS} />
        </div>

        {/* Bulk action toolbar */}
        <div className={cn(
          'flex items-center w-full transition-opacity duration-150',
          hasSelection ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-x-3 inset-y-0 items-center',
        )}>
          <BulkActionBar onExportSelected={handleExportSelected} />
        </div>
      </div>

      {(activePredicates.length > 0 || manualPredicates.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b px-3">
          {activePredicates.length > 0 && (
            <FilterChips predicates={activePredicates} onRemovePredicate={onRemoveNlPredicate} onClearFilter={onClearNlFilter} />
          )}
          {manualPredicates.length > 0 && (
            <FilterChips predicates={manualPredicates} onRemovePredicate={onRemoveManualPredicate} onClearFilter={onClearManualPredicates} />
          )}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <Leaderboard onExportReady={handleExportReady} />
      </div>
    </>
  );
}

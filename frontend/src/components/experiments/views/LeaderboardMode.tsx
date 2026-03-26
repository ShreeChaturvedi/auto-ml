import { LayoutDashboard, Table2 } from 'lucide-react';
import type { FilterPredicate } from '@/types/experiments';
import { Leaderboard } from '../Leaderboard';
import { NlFilterBar } from '../NlFilterBar';
import { IconModeToggle } from '@/components/data/IconModeToggle';
import { FilterChips } from '../FilterChips';

const VIEW_OPTIONS = [
  { value: 'overview', ariaLabel: 'Overview', icon: LayoutDashboard, tooltip: 'Overview' },
  { value: 'leaderboard', ariaLabel: 'Leaderboard', icon: Table2, tooltip: 'Leaderboard' },
] as const;

interface LeaderboardModeProps {
  experimentView: string;
  activePredicates: FilterPredicate[];
  onViewChange: (val: string) => void;
  onRemovePredicate: (index: number) => void;
  onClearFilter: () => void;
}

export function LeaderboardMode({
  experimentView,
  activePredicates,
  onViewChange,
  onRemovePredicate,
  onClearFilter,
}: LeaderboardModeProps) {
  const filterChips = <FilterChips predicates={activePredicates} onRemovePredicate={onRemovePredicate} onClearFilter={onClearFilter} />;

  return (
    <>
      <div className="flex h-14 items-center gap-3 border-b px-3 shrink-0">
        <NlFilterBar />
        <IconModeToggle
          value={experimentView}
          onValueChange={onViewChange}
          options={VIEW_OPTIONS}
        />
      </div>
      {filterChips && <div className="border-b px-3">{filterChips}</div>}
      <div className="flex-1 min-h-0">
        <Leaderboard />
      </div>
    </>
  );
}

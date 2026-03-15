/**
 * EDAColumnSelector — popover-based column picker with search and type filtering.
 * Supports single-select (closes on pick) and multi-select modes.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  HelpCircle,
  ChevronDown,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { truncateText } from './edaFormatters';
import { DATA_TYPE_ICONS } from './edaConstants';
import type { DataQualitySummary } from '@/types/file';

type ColumnType = DataQualitySummary['dataType'];
type FilterType = 'all' | 'numeric' | 'categorical';

interface EDAColumnSelectorProps {
  columns: Array<{ name: string; type: ColumnType }>;
  selected: string[];
  onSelectionChange: (cols: string[]) => void;
  multiple?: boolean;
  filterType?: FilterType;
  placeholder?: string;
  className?: string;
}

export function EDAColumnSelector({
  columns,
  selected,
  onSelectionChange,
  multiple = false,
  filterType: initialFilterType = 'all',
  placeholder,
  className,
}: EDAColumnSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>(initialFilterType);

  const filteredColumns = useMemo(() => {
    let filtered = columns;

    // Apply type filter
    if (filter !== 'all') {
      filtered = filtered.filter((c) => c.type === filter);
    }

    // Apply search filter
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(term));
    }

    return filtered;
  }, [columns, filter, search]);

  const handleSelect = useCallback(
    (name: string) => {
      if (multiple) {
        const next = selected.includes(name)
          ? selected.filter((s) => s !== name)
          : [...selected, name];
        onSelectionChange(next);
      } else {
        onSelectionChange([name]);
        setOpen(false);
      }
    },
    [multiple, selected, onSelectionChange],
  );

  const displayText = useMemo(() => {
    if (selected.length === 0) return placeholder || 'Select column\u2026';
    if (selected.length <= 2) return selected.join(', ');
    return `${selected[0]}, ${selected[1]} +${selected.length - 2}`;
  }, [selected, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs',
            'hover:bg-accent hover:text-accent-foreground transition-colors',
            'min-w-[140px]',
            className,
          )}
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-2" align="start">
        {/* Search input */}
        <input
          type="text"
          placeholder="Search columns\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            'w-full rounded-md border border-input bg-background px-2 py-1 text-xs',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />

        {/* Filter chips */}
        <div className="flex gap-1 my-1.5">
          {(['all', 'numeric', 'categorical'] as const).map((f) => (
            <Badge
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              className="cursor-pointer text-[10px] px-1.5 py-0"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'numeric' ? 'Numeric' : 'Categorical'}
            </Badge>
          ))}
        </div>

        {/* Column list */}
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filteredColumns.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No columns found
            </div>
          )}
          {filteredColumns.map((col) => {
            const Icon = DATA_TYPE_ICONS[col.type] ?? HelpCircle;
            const isSelected = selected.includes(col.name);

            return (
              <div
                key={col.name}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(col.name)}
                className={cn(
                  'flex items-center gap-2 px-2 py-1 rounded text-xs',
                  'hover:bg-muted/50 cursor-pointer transition-colors',
                  isSelected && 'bg-muted/40',
                )}
              >
                <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate flex-1">{truncateText(col.name, 24)}</span>
                {isSelected && (
                  <Check className="h-3 w-3 text-primary shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

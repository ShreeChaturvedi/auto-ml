import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortHeaderProps<T extends string> {
  field: T;
  label: string;
  sortField: T;
  sortDir: 'asc' | 'desc';
  onToggle: (field: T) => void;
  /** Optional icon displayed before the label */
  icon?: LucideIcon;
  /** Text alignment — defaults to 'left' */
  align?: 'left' | 'right';
  className?: string;
  /** Header text styling — defaults to small uppercase tracking */
  headerClassName?: string;
}

export function SortHeader<T extends string>({
  field, label, sortField, sortDir, onToggle, icon: Icon, align = 'left', className,
  headerClassName = 'text-[11px] uppercase tracking-wider',
}: SortHeaderProps<T>) {
  const active = sortField === field;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn('px-3 py-2 text-xs font-medium text-muted-foreground', headerClassName, className)}
    >
      <button
        type="button"
        onClick={() => onToggle(field)}
        className={cn(
          'flex items-center gap-1 hover:text-foreground transition-colors',
          align === 'right' && 'ml-auto flex-row-reverse',
        )}
      >
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

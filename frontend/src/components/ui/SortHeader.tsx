import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  headerClassName = 'uppercase tracking-wider',
}: SortHeaderProps<T>) {
  const active = sortField === field;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  const ArrowIcon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn('px-4 text-left align-middle text-xs font-medium text-muted-foreground', headerClassName, className)}
    >
      <div className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 font-medium"
          onClick={() => onToggle(field)}
        >
          {label}
          <ArrowIcon className="ml-2 h-3 w-3 text-muted-foreground" />
        </Button>
      </div>
    </th>
  );
}

import { X, ListFilter } from 'lucide-react';
import type { FilterPredicate } from '@/types/experiments';
import { formatOperator } from './utils';
import { cn } from '@/lib/utils';

interface FilterChipsProps {
  predicates: FilterPredicate[];
  onRemovePredicate: (index: number) => void;
  onClearFilter: () => void;
}

export function FilterChips({ predicates, onRemovePredicate, onClearFilter }: FilterChipsProps) {
  if (predicates.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-2 shrink-0">
      <ListFilter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {predicates.map((pred, i) => (
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
            className="absolute inset-y-0 right-0 flex items-center justify-center w-7 opacity-0 pointer-events-none transition-opacity duration-200 group-hover/chip:opacity-100 group-hover/chip:pointer-events-auto group-focus-within/chip:opacity-100 group-focus-within/chip:pointer-events-auto text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onRemovePredicate(i)}
            aria-label={`Remove filter: ${pred.field} ${formatOperator(pred.operator)} ${pred.value}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ml-1 px-2 py-1 text-xs text-muted-foreground rounded-md transition-colors hover:bg-muted/50 hover:text-foreground"
        onClick={onClearFilter}
      >
        Clear all
      </button>
    </div>
  );
}

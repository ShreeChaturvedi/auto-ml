import { Hash, Table2, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarkdownEmptyStateProps {
  isLocked: boolean;
  onChipSelect: (content: string) => void;
}

const CHIPS = [
  { label: 'Heading', content: '## ', icon: Hash },
  {
    label: 'Table',
    content: '| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n|  |  |  |',
    icon: Table2
  },
  { label: 'Checklist', content: '- [ ] \n- [ ] \n- [ ] ', icon: ListChecks }
] as const;

export function MarkdownEmptyState({
  isLocked,
  onChipSelect
}: MarkdownEmptyStateProps) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {CHIPS.map(({ label, content, icon: Icon }) => (
        <button
          key={label}
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
            'border-border/60 bg-muted/30 text-muted-foreground',
            'hover:bg-muted/60 hover:text-foreground hover:border-border',
            isLocked && 'opacity-50 cursor-not-allowed'
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (isLocked) return;
            onChipSelect(content);
          }}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

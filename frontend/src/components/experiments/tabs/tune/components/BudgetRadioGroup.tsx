import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';

const BUDGET_OPTIONS = [
  { id: 'quick', label: 'Quick', detail: '20 trials ~2 min' },
  { id: 'balanced', label: 'Balanced', detail: '50 trials ~5 min' },
  { id: 'deep', label: 'Deep', detail: '100 trials ~15 min' },
  { id: 'maximum', label: 'Maximum', detail: '200 trials ~30 min' },
] as const;

interface BudgetRadioGroupProps {
  value: string;
  onChange: (id: string) => void;
}

export function BudgetRadioGroup({ value, onChange }: BudgetRadioGroupProps) {
  const { colorClasses } = useProjectThemeColor();

  return (
    <div className="grid grid-cols-4 gap-2">
      {BUDGET_OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              selected
                ? `${colorClasses?.borderAccent ?? 'border-primary'} ${colorClasses?.bg ?? 'bg-primary/10'}`
                : 'border-border/30 hover:border-border/60 hover:bg-muted/30',
            )}
          >
            <p className="text-sm font-medium">{opt.label}</p>
            <p className="text-xs text-muted-foreground">{opt.detail}</p>
          </button>
        );
      })}
    </div>
  );
}

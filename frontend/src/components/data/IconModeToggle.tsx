import type { ComponentType } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface IconModeToggleOption<T extends string = string> {
  value: T;
  ariaLabel: string;
  icon: ComponentType<{ className?: string }>;
  tooltip?: string;
}

interface IconModeToggleProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly IconModeToggleOption<T>[];
  className?: string;
  itemClassName?: string;
  /**
   * Explicit icon class - if provided, this takes precedence over automatic accent color.
   * Useful when you want a specific color regardless of project theme.
   */
  selectedIconClassName?: string;
}

export function IconModeToggle<T extends string = string>({
  value,
  onValueChange,
  options,
  className,
  itemClassName,
  selectedIconClassName,
}: IconModeToggleProps<T>) {
  // Priority: explicit prop > accent token > default
  const iconColorClass = selectedIconClassName ?? 'text-accent-text';

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (!nextValue) return;
        const match = options.find((o) => o.value === nextValue);
        if (match) onValueChange(match.value);
      }}
      className={cn('bg-muted/50 p-0.5 rounded-md h-7', className)}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;

        if (!option.tooltip) {
          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.ariaLabel}
              className={cn('h-6 w-6 data-[state=on]:bg-background data-[state=on]:shadow-sm', itemClassName)}
            >
              <Icon className={cn('h-3 w-3', isSelected ? iconColorClass : 'text-muted-foreground')} />
            </ToggleGroupItem>
          );
        }

        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <ToggleGroupItem
                  value={option.value}
                  aria-label={option.ariaLabel}
                  className={cn('h-6 w-6 data-[state=on]:bg-background data-[state=on]:shadow-sm', itemClassName)}
                >
                  <Icon className={cn('h-3 w-3', isSelected ? iconColorClass : 'text-muted-foreground')} />
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{option.tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

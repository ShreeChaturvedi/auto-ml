import type { ComponentType } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface IconModeToggleOption {
  value: string;
  ariaLabel: string;
  icon: ComponentType<{ className?: string }>;
  tooltip?: string;
}

interface IconModeToggleProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly IconModeToggleOption[];
  className?: string;
  itemClassName?: string;
}

export function IconModeToggle({
  value,
  onValueChange,
  options,
  className,
  itemClassName
}: IconModeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={onValueChange}
      className={cn('bg-muted/50 p-0.5 rounded-md h-7', className)}
    >
      {options.map((option) => {
        const Icon = option.icon;

        if (!option.tooltip) {
          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.ariaLabel}
              className={cn('h-6 w-6 data-[state=on]:bg-background data-[state=on]:shadow-sm', itemClassName)}
            >
              <Icon className="h-3 w-3" />
            </ToggleGroupItem>
          );
        }

        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={option.value}
                aria-label={option.ariaLabel}
                className={cn('h-6 w-6 data-[state=on]:bg-background data-[state=on]:shadow-sm', itemClassName)}
              >
                <Icon className="h-3 w-3" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">{option.tooltip}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}

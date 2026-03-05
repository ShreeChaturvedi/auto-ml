import type { ComponentType } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses } from '@/types/project';

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
  /**
   * Explicit icon class - if provided, this takes precedence over automatic project color.
   * Useful when you want a specific color regardless of project theme.
   */
  selectedIconClassName?: string;
  /**
   * Whether to apply the project theme color to the selected icon.
   * Defaults to true. Set to false to use default styling.
   */
  useProjectColor?: boolean;
}

export function IconModeToggle({
  value,
  onValueChange,
  options,
  className,
  itemClassName,
  selectedIconClassName,
  useProjectColor = true
}: IconModeToggleProps) {
  // Get project theme color automatically
  const { activeProjectId, projects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === activeProjectId);
  
  const projectColorClass = activeProject && useProjectColor
    ? projectColorClasses[activeProject.color]?.text
    : null;
  
  // Priority: explicit prop > project color > default
  const iconColorClass = selectedIconClassName ?? projectColorClass ?? 'text-foreground';

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={onValueChange}
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

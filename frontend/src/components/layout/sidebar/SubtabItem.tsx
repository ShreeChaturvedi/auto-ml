/**
 * SubtabItem — reusable sidebar subtab with icon, label, underline hover, and theme color active state.
 *
 * Uses a <div role="button"> so that interactive content (e.g. dropdown menus)
 * can be placed in the actionSlot without nesting <button> violations.
 */

import { type ComponentType } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SubtabItemProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
  /** Optional right-side slot (e.g., "..." dropdown for file items) */
  actionSlot?: React.ReactNode;
  /** Override icon color on hover/active (defaults to accent text) */
  iconColorClass?: string;
  /** Small absolute-positioned dot on the icon corner (e.g. status indicator) */
  indicatorDotClass?: string;
}

export function SubtabItem({
  icon: Icon,
  label,
  isActive,
  onClick,
  actionSlot,
  iconColorClass,
  indicatorDotClass
}: SubtabItemProps) {
  const iconColor = iconColorClass
    ? iconColorClass
    : isActive ? 'text-accent-text' : 'text-muted-foreground group-hover:text-foreground';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'group w-full flex items-center gap-2 px-3 py-1.5 min-h-6 text-left text-[13px] truncate transition-colors duration-200 cursor-pointer',
        'focus-visible:outline-none focus-visible:bg-accent',
        !isActive && 'text-muted-foreground hover:text-foreground hover:underline underline-offset-2 decoration-muted-foreground/50'
      )}
    >
      <div className="relative shrink-0">
        <Icon className={cn('h-3.5 w-3.5 transition-colors duration-200', iconColor)} />
        {indicatorDotClass && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full',
              indicatorDotClass
            )}
          />
        )}
      </div>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn('flex-1 truncate', isActive && 'text-foreground')}>{label}</span>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs text-xs">
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {actionSlot && (
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {actionSlot}
        </span>
      )}
    </div>
  );
}

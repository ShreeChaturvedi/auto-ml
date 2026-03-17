/**
 * SubtabItem — reusable sidebar subtab with icon, label, underline hover, and theme color active state.
 *
 * Uses a <div role="button"> so that interactive content (e.g. dropdown menus)
 * can be placed in the actionSlot without nesting <button> violations.
 */

import { useState, type ComponentType } from 'react';
import { cn } from '@/lib/utils';

interface SubtabItemProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  themeColorClass: string;
  onClick: () => void;
  /** Optional right-side slot (e.g., "..." dropdown for file items) */
  actionSlot?: React.ReactNode;
  /** Override icon color on hover/active (defaults to themeColorClass) */
  iconColorClass?: string;
}

export function SubtabItem({
  icon: Icon,
  label,
  isActive,
  themeColorClass,
  onClick,
  actionSlot,
  iconColorClass
}: SubtabItemProps) {
  const [hovered, setHovered] = useState(false);

  const iconColor = isActive || hovered ? (iconColorClass ?? themeColorClass) : 'text-muted-foreground';

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'group w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs truncate transition-colors duration-200 cursor-pointer',
        isActive
          ? 'font-medium'
          : 'text-muted-foreground hover:text-foreground hover:underline underline-offset-2 decoration-muted-foreground/50'
      )}
    >
      <div className="relative z-10 shrink-0 rounded-sm bg-card">
        <Icon className={cn('h-3.5 w-3.5 transition-colors duration-200', iconColor)} />
      </div>
      <span className={cn('flex-1 truncate', isActive && themeColorClass)}>
        {label}
      </span>
      {actionSlot && (
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
          {actionSlot}
        </span>
      )}
    </div>
  );
}

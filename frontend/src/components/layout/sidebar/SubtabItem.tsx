/**
 * SubtabItem — reusable sidebar subtab with icon, label, underline hover, and theme color active state.
 *
 * Note: uses useState for hover tracking because the icon's hover color is a dynamic
 * Tailwind class (themeColorClass) which can't be used with group-hover: at compile time.
 */

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubtabItemProps {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  themeColorClass: string;
  onClick: () => void;
  /** Optional right-side slot (e.g., "..." dropdown for file items) */
  actionSlot?: React.ReactNode;
}

export function SubtabItem({
  icon: Icon,
  label,
  isActive,
  themeColorClass,
  onClick,
  actionSlot
}: SubtabItemProps) {
  const [hovered, setHovered] = useState(false);

  const iconColor = isActive || hovered ? themeColorClass : 'text-muted-foreground';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs truncate transition-colors duration-200',
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
    </button>
  );
}

/**
 * Shared kebab trigger + dropdown shell for sidebar subtabs (files, workbooks, models).
 */

import { type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const triggerClassName =
  'h-5 w-5 -my-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity';

export function SidebarSubtabActionMenu({
  ariaLabel,
  children,
  align = 'end'
}: {
  ariaLabel: string;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={triggerClassName}
        >
          <MoreVertical className="h-3 w-3" />
          <span className="sr-only">{ariaLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

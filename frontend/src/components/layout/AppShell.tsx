/**
 * AppShell - Main application layout container
 *
 * Structure:
 * - Sidebar (left, collapsible) - shows phases for active project
 * - MainContent (center, contains phase content)
 *
 * Note: Global top ribbon removed. Each phase shows its own contextual ribbon.
 * Theme toggle and sidebar collapse are now in the sidebar header.
 */

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';
import { getSidebarCollapsedPref, setSidebarCollapsedPref } from '@/lib/sidebarPrefs';

interface AppShellProps {
  children: React.ReactNode;
  viewportMode?: 'screen' | 'container';
  sidebar?: React.ReactNode;
}

export function AppShell({ children, viewportMode = 'screen', sidebar }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => getSidebarCollapsedPref());

  return (
    <div className={cn('flex w-full overflow-hidden bg-background', viewportMode === 'screen' ? 'h-screen' : 'h-full')}>
      {/* Sidebar - collapsed = narrow (icons only), expanded = full width */}
      <div
        className={cn(
          'flex-shrink-0 border-r border-border bg-card transition-[width] duration-300 ease-quart-out',
          sidebarCollapsed ? 'w-16' : 'w-72'
        )}
      >
        {sidebar ?? (
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => {
              const next = !sidebarCollapsed;
              setSidebarCollapsed(next);
              setSidebarCollapsedPref(next);
            }}
          />
        )}
      </div>

      {/* Main Content Area - no top bar, phase content fills entire area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto relative">{children}</div>
      </div>
    </div>
  );
}

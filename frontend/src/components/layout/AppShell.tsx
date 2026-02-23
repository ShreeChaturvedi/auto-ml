/**
 * AppShell - Main application layout container
 *
 * Structure:
 * - Sidebar (left, collapsible) - shows phases for active project
 * - MainContent (center, contains phase content)
 *
 * Note: Global top ribbon removed. Each phase shows its own contextual ribbon.
 * Theme toggle and sidebar collapse are now in the sidebar header.
 * ContinueButton is fixed at bottom-right for phase navigation.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ContinueButton } from './ContinueButton';
import { useProjectStore } from '@/stores/projectStore';
import type { Phase } from '@/types/phase';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { projectId, phase } = useParams<{ projectId: string; phase: string }>();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);

  // Get current phase from URL or project state
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;
  const currentPhase = (phase as Phase) || activeProject?.currentPhase;
  const effectiveProjectId = projectId || activeProjectId;

  // Only show continue button if phase is not yet completed (first time viewing)
  const isPhaseCompleted = activeProject?.completedPhases?.includes(currentPhase as Phase) ?? false;
  const showContinueButton = effectiveProjectId && currentPhase && !isPhaseCompleted;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar - collapsed = narrow (icons only), expanded = full width */}
      <div
        className={cn(
          'flex-shrink-0 border-r border-border bg-card transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'w-16' : 'w-72'
        )}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main Content Area - no top bar, phase content fills entire area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>

      {/* Fixed Continue Button at bottom-right - only shows for uncompleted phases */}
      {showContinueButton && (
        <div className="fixed bottom-6 right-6 z-50">
          <ContinueButton
            currentPhase={currentPhase}
            projectId={effectiveProjectId}
            className="shadow-lg"
          />
        </div>
      )}
    </div>
  );
}

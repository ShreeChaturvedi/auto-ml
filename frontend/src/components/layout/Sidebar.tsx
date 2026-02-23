/**
 * Sidebar - Left navigation panel
 *
 * Clean collapse animation:
 * - Collapse button is now inside PhaseList/ProjectIconList (replaces heading)
 * - Icons stay in EXACT same position
 * - Only width and opacity change
 */

import { useNavigate } from 'react-router-dom';
import { Home, PanelLeft } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { FileExplorer } from '@/components/data/FileExplorer';
import { PhaseList } from './PhaseList';
import { ProjectList } from '@/components/projects/ProjectList';
import { UserProfile } from '@/components/projects/UserProfile';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses } from '@/types/project';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : undefined;

  const handleGoHome = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveProject(null);
    navigate('/');
  };

  // Expand when clicking anywhere on sidebar background (not buttons)
  const handleSidebarClick = (e: React.MouseEvent) => {
    if (collapsed && e.target === e.currentTarget) {
      onToggleCollapse();
    }
  };

  // Get project icon component
  const ProjectIcon = activeProject
    ? (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    activeProject.icon
    ]
    : null;

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col',
        collapsed && 'cursor-e-resize'
      )}
      onClick={handleSidebarClick}
    >
      {/* Header - exactly h-14 to align with content ribbons */}
      <div
        className="h-14 shrink-0 flex items-center px-4 gap-2 border-b border-border"
        onClick={collapsed ? (e) => { e.stopPropagation(); onToggleCollapse(); } : undefined}
      >
        {/* Project icon - always at left, fixed position */}
        {activeProject && ProjectIcon ? (
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md shrink-0',
              projectColorClasses[activeProject.color].bg
            )}
          >
            <ProjectIcon
              className={cn('h-4 w-4', projectColorClasses[activeProject.color].text)}
            />
          </div>
        ) : (
          <Logo size="sm" showText={false} className="text-foreground shrink-0" />
        )}

        {/* Title - project name or AutoML, fades with opacity */}
        <span
          className={cn(
            'flex-1 text-sm font-semibold text-foreground truncate transition-opacity duration-300',
            collapsed && 'opacity-0'
          )}
        >
          {activeProject?.title ?? 'AutoML'}
        </span>

        {/* Header actions - fade out when collapsed */}
        <div
          className={cn(
            'flex items-center gap-0.5 shrink-0 transition-opacity duration-300',
            collapsed ? 'opacity-0 pointer-events-none w-0 overflow-hidden' : 'opacity-100'
          )}
        >
          {activeProject && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleGoHome}
                  >
                    <Home className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Go to projects</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div onClick={(e) => e.stopPropagation()}>
                  <ThemeToggle />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Toggle theme</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Collapse sidebar</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Main Content Section */}
      <div
        className="flex-1 overflow-hidden"
        onClick={collapsed ? (e) => { e.stopPropagation(); onToggleCollapse(); } : undefined}
      >
        <div className="h-full overflow-y-auto scrollbar-thin">
          <div className="p-3">
            {activeProject ? (
              <div className="space-y-4">
                {/* PhaseList now handles the collapse button internally */}
                <PhaseList collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
                {/* Hide file explorer when collapsed */}
                <div
                  className={cn(
                    'transition-all duration-300 overflow-hidden',
                    collapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
                  )}
                >
                  <FileExplorer projectId={activeProject.id} />
                </div>
              </div>
            ) : (
              /* Show project list when no project is active - handles both collapsed states */
              <ProjectList collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* User Profile - no extra padding, UserProfile handles its own styling */}
      <div
        onClick={collapsed ? (e) => { e.stopPropagation(); onToggleCollapse(); } : undefined}
      >
        <UserProfile collapsed={collapsed} />
      </div>
    </div>
  );
}

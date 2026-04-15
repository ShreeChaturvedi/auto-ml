/**
 * Sidebar - Left navigation panel
 *
 * Clean collapse animation:
 * - Collapse button is now inside WorkflowPhaseTree/ProjectIconList (replaces heading)
 * - Icons stay in EXACT same position
 * - Only width and opacity change
 */

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Home, PanelLeft, Pencil } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { getLucideIcon } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { isDemoMode } from '@/lib/demoMode';

import { WorkflowPhaseTree } from './WorkflowPhaseTree';
import { ProjectDialog } from '@/components/projects/ProjectDialog';
import { ProjectList } from '@/components/projects/ProjectList';
import { UserProfile } from '@/components/projects/UserProfile';
import { useProjectStore } from '@/stores/projectStore';
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
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [editDialogProject, setEditDialogProject] = useState<
    import('@/types/project').Project | undefined
  >(undefined);
  // Narrow selector: only re-render when the active project's id/title/icon change,
  // not on every mutation to the projects array.
  const activeProject = useProjectStore(
    useShallow((s) => {
      if (!s.activeProjectId) return undefined;
      const p = s.projects.find((proj) => proj.id === s.activeProjectId);
      return p ? { id: p.id, title: p.title, icon: p.icon } : undefined;
    })
  );
  const activeProjectId = activeProject?.id ?? null;
  const setActiveProject = useProjectStore((state) => state.setActiveProject);

  const handleGoHome = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDemoMode()) {
      return;
    }
    const el = sidebarRef.current;
    // Suppress CSS transitions so the sidebar swap doesn't flash.
    if (el) el.dataset.instantNav = '';
    flushSync(() => {
      setActiveProject(null);
      navigate('/');
    });
    // Double-rAF: first fires before paint, second fires after — ensures
    // transitions re-enable only once the final DOM state is on screen.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (el) el.removeAttribute('data-instant-nav');
      })
    );
  };

  const handleOpenProjectEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Fetch the full project at click time so the dialog gets every field
    // without the sidebar subscribing to the entire projects array.
    const { activeProjectId: id, projects } = useProjectStore.getState();
    const full = id ? projects.find((p) => p.id === id) : undefined;
    setEditDialogProject(full);
  };

  const handleSidebarClick = (e: React.MouseEvent) => {
    if (collapsed && e.target === e.currentTarget) {
      onToggleCollapse();
    }
  };

  const handleExpandClick = collapsed
    ? (e: React.MouseEvent) => { e.stopPropagation(); onToggleCollapse(); }
    : undefined;

  const ProjectIcon = activeProject ? getLucideIcon(activeProject.icon) : null;

  return (
    <TooltipProvider delayDuration={300}>
    <div
      ref={sidebarRef}
      className={cn(
        'flex h-full w-full flex-col',
        collapsed && 'cursor-e-resize'
      )}
      onClick={handleSidebarClick}
    >
      <div
        className="h-14 shrink-0 flex items-center px-4 gap-2 border-b border-border"
        onClick={handleExpandClick}
      >
        {activeProject && ProjectIcon ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleOpenProjectEdit}
                aria-label={`Project settings for ${activeProject.title}`}
                className={cn(
                  'group relative flex h-8 w-8 items-center justify-center rounded-md shrink-0 transition-opacity',
                  'bg-accent-bg'
                )}
              >
                <ProjectIcon
                  className={cn(
                    'h-4 w-4 transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0',
                    'text-accent-text'
                  )}
                />
                <Pencil
                  className={cn(
                    'absolute h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
                    'text-accent-text'
                  )}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Project settings</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center shrink-0">
            <Logo size="sm" showText={false} className="text-foreground" />
          </div>
        )}

        <span
          className={cn(
            'flex-1 text-sm font-semibold text-foreground truncate transition-opacity duration-300',
            collapsed && 'opacity-0'
          )}
        >
          {activeProject?.title ?? 'AutoML'}
        </span>

        <div
          className={cn(
            'flex items-center gap-0.5 shrink-0 transition-opacity duration-300',
            collapsed ? 'opacity-0 pointer-events-none w-0 overflow-hidden' : 'opacity-100'
          )}
        >
          {activeProject && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleGoHome}
                  aria-label="Go to projects"
                >
                  <Home className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Go to projects</p>
              </TooltipContent>
            </Tooltip>
          )}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Collapse sidebar</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Main Content Section */}
      <div
        className="flex-1 overflow-hidden"
        onClick={handleExpandClick}
      >
        <div className="h-full overflow-y-auto">
          <div className="p-3">
            {activeProject ? (
              <WorkflowPhaseTree collapsed={collapsed} projectId={activeProjectId!} />
            ) : (
              <ProjectList collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* User Profile - no extra padding, UserProfile handles its own styling */}
      <div
        onClick={handleExpandClick}
      >
        <UserProfile collapsed={collapsed} />
      </div>

      {editDialogProject && (
        <ProjectDialog
          open={!!editDialogProject}
          onOpenChange={(open) => { if (!open) setEditDialogProject(undefined); }}
          project={editDialogProject}
        />
      )}
    </div>
    </TooltipProvider>
  );
}

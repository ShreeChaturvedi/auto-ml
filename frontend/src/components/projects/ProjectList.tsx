/**
 * ProjectList - List of all projects in the sidebar
 * Uses ProjectItem for each project to preserve context menu functionality
 */

import { useState } from 'react';
import { Plus, PanelLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { ProjectItem } from './ProjectItem';
import { ProjectsEmptyIllustration } from './ProjectsEmptyIllustration';
import { ProjectDialog } from './ProjectDialog';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface ProjectListProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ProjectList({ collapsed = false, onToggleCollapse }: ProjectListProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const projects = useProjectStore((state) => state.projects);
  const isInitialized = useProjectStore((state) => state.isInitialized);
  const isLoading = useProjectStore((state) => state.isLoading);

  return (
    <>
      <div className="space-y-1">
        {/* Header */}
        <div className="flex items-center gap-1 px-2 py-1">
          {collapsed ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
              className="flex items-center gap-1 hover:bg-muted/50 rounded transition-colors"
            >
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-6 w-6 flex items-center justify-center shrink-0">
                      <PanelLeft className="h-4 w-4" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Expand sidebar</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </button>
          ) : (
            <button
              onClick={() => setSectionExpanded(!sectionExpanded)}
              className="group flex-1 flex items-center gap-1 rounded transition-colors"
            >
              <div className="h-6 w-6 flex items-center justify-center shrink-0">
                {sectionExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                )}
              </div>
              <h2 className="text-workflow-label font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                Projects
              </h2>
            </button>
          )}

          {/* New-project button — always in DOM; collapses to w-0 to prevent layout jump.
              Opacity fades out fast (75 ms) so the icon disappears before the width
              animation can slide it sideways; fades back in with a delay so it only
              appears once the container has re-opened. */}
          <div
            className={cn(
              'shrink-0 overflow-hidden transition-[width] duration-300',
              collapsed ? 'w-0 pointer-events-none' : 'w-6'
            )}
          >
            <button
              type="button"
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground transition-opacity',
                collapsed ? 'opacity-0 duration-75' : 'opacity-100 duration-150 delay-150'
              )}
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">New project</span>
            </button>
          </div>
        </div>

        {/* Project items - smooth collapse/expand with height + fade */}
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
            (collapsed || sectionExpanded) ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="min-h-0 overflow-hidden">
          <div className="space-y-0.5">
            {!isInitialized && isLoading ? (
              <div className={cn(
                'flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground',
                collapsed && 'hidden'
              )}>
                Loading...
              </div>
            ) : projects.length > 0 ? (
              projects.map((project, index) => (
                <div key={project.id} className="empty-state-enter" style={{ animationDelay: `${index * 50}ms` }}>
                  <ProjectItem project={project} collapsed={collapsed} />
                </div>
              ))
            ) : !collapsed ? (
              <div className="flex flex-col items-center justify-center pt-6 pb-8 text-center empty-state-enter">
                <ProjectsEmptyIllustration className="mb-2.5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No projects yet</p>
              </div>
            ) : null}
          </div>
          </div>
        </div>
      </div>

      <ProjectDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </>
  );
}

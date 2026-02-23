/**
 * ProjectList - List of all projects in the sidebar
 * Uses ProjectItem for each project to preserve context menu functionality
 */

import { useState } from 'react';
import { Plus, FolderOpen, PanelLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/projectStore';
import { ProjectItem } from './ProjectItem';
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
            <>
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
              <div className="shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">New project</span>
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Project items */}
        {(collapsed || sectionExpanded) && (
          <div className="space-y-0.5">
            {!isInitialized && isLoading ? (
              <div className={cn(
                'flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground',
                collapsed && 'hidden'
              )}>
                Loading...
              </div>
            ) : projects.length > 0 ? (
              projects.map((project) => (
                <ProjectItem key={project.id} project={project} collapsed={collapsed} />
              ))
            ) : !collapsed ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderOpen className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-xs text-muted-foreground mb-3">No projects yet</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-3 w-3 mr-2" />
                  Create Project
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <ProjectDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </>
  );
}

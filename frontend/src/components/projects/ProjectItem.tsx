/**
 * ProjectItem - Individual project item in the sidebar
 *
 * Features:
 * - Icon with color background
 * - Project title
 * - Right-click context menu (edit, delete)
 * - Click to select project and navigate to it
 * - Collapsed state support for sidebar
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Edit, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useProjectStore } from '@/stores/projectStore';
import type { Project } from '@/types/project';
import { resolveProjectColor } from '@/types/project';
import { ProjectDialog } from './ProjectDialog';
import { cn } from '@/lib/utils';
import { getLucideIcon } from '@/lib/icons';

interface ProjectItemProps {
  project: Project;
  collapsed?: boolean;
}

export function ProjectItem({ project, collapsed = false }: ProjectItemProps) {
  const navigate = useNavigate();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const [isDeleting, setIsDeleting] = useState(false);

  const titleRef = useRef<HTMLSpanElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const handleTooltipOpenChange = useCallback((open: boolean) => {
    if (!open) { setTooltipOpen(false); return; }
    // Always show tooltip when collapsed (icon-only); otherwise only when truncated
    if (collapsed) { setTooltipOpen(true); return; }
    const el = titleRef.current;
    setTooltipOpen(!!el && el.scrollWidth > el.clientWidth);
  }, [collapsed]);

  const isActive = activeProjectId === project.id;
  const colorClasses = resolveProjectColor(project.color, project.customColor);

  // Get icon component dynamically
  const IconComponent = getLucideIcon(project.icon);

  const handleDelete = async () => {
    if (isDeleting) return;
    try {
      setIsDeleting(true);
      await deleteProject(project.id);
    } catch (error) {
      console.error('Failed to delete project', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleProjectClick = () => {
    setActiveProject(project.id);
    navigate(`/project/${project.id}`);
  };

  const itemContent = (
    <div
      data-testid={`project-item-${project.id}`}
      className={cn(
        'group flex items-center gap-2 rounded-md px-1.5 py-1.5 cursor-pointer transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted/50 text-foreground'
      )}
      onClick={handleProjectClick}
    >
      {/* Icon with colored background */}
      <div
        className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
          !colorClasses.style && colorClasses.bg,
          !colorClasses.style && colorClasses.text
        )}
        style={colorClasses.style}
      >
        {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
      </div>

      {/* Project title - kept in DOM; fades out via opacity when collapsed to prevent layout jump */}
      <span
        ref={titleRef}
        className={cn(
          'flex-1 truncate text-sm font-medium transition-opacity duration-300',
          collapsed ? 'opacity-0' : 'opacity-100'
        )}
      >
        {project.title}
      </span>

      {/* More options menu - kept in DOM; collapses to w-0 to prevent layout jump */}
      <div
        className={cn(
          'shrink-0 overflow-hidden transition-[width] duration-300',
          collapsed ? 'w-0 pointer-events-none' : 'w-6'
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded-md p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
              <span className="sr-only">More options</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsEditDialogOpen(true);
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteDialogOpen(true);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          {itemContent}
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{project.title}</p>
        </TooltipContent>
      </Tooltip>

      <ProjectDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        project={project}
      />

      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => { if (!isDeleting) setIsDeleteDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{project.title}&rdquo;? All associated data including datasets,
              notebooks, and experiments will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isDeleting} onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                await handleDelete();
                setIsDeleteDialogOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

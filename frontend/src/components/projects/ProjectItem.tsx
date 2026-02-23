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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Edit, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useProjectStore } from '@/stores/projectStore';
import type { Project } from '@/types/project';
import { projectColorClasses } from '@/types/project';
import { ProjectDialog } from './ProjectDialog';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';

interface ProjectItemProps {
  project: Project;
  collapsed?: boolean;
}

export function ProjectItem({ project, collapsed = false }: ProjectItemProps) {
  const navigate = useNavigate();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const [isDeleting, setIsDeleting] = useState(false);

  const isActive = activeProjectId === project.id;
  const colorClasses = projectColorClasses[project.color];

  // Get icon component dynamically
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    project.icon
  ];

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
          : 'hover:bg-accent/50 text-foreground'
      )}
      onClick={handleProjectClick}
    >
      {/* Icon with colored background */}
      <div
        className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
          colorClasses.bg,
          colorClasses.text
        )}
      >
        {IconComponent && <IconComponent className="h-3.5 w-3.5" />}
      </div>

      {/* Project title - hidden when collapsed */}
      {!collapsed && (
        <span className="flex-1 truncate text-sm font-medium" title={project.title}>
          {project.title}
        </span>
      )}

      {/* More options menu - hidden when collapsed */}
      {!collapsed && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
              <span className="sr-only">More options</span>
            </Button>
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
                void handleDelete();
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <>
      {collapsed ? (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              {itemContent}
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{project.title}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        itemContent
      )}

      {/* Edit Project Dialog */}
      <ProjectDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        project={project}
      />
    </>
  );
}

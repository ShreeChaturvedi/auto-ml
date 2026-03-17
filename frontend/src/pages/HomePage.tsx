import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty';
import { ShootingStars } from '@/components/ui/shooting-stars';
import { StarsBackground } from '@/components/ui/stars-background';
import { ProjectDialog } from '@/components/projects/ProjectDialog';
import { useProjectStore } from '@/stores/projectStore';

// Home page - shown when no project is selected
export function HomePage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  // Fix: Use individual selectors to avoid creating new objects on every render
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const isInitialized = useProjectStore((state) => state.isInitialized);
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);

  // Clear active project when HomePage mounts (fixes navigation bug)
  useEffect(() => {
    if (activeProjectId !== null) {
      setActiveProject(null);
    }
  }, [activeProjectId, setActiveProject]);

  if (!isInitialized && isLoading && projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  if (error && projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Create Project
          </Button>
          <ProjectDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* Background visual effects — absolutely positioned, pointer-events disabled */}
      <StarsBackground />
      <ShootingStars />

      {/* Page content — sits above background layers via z-index stacking context */}
      <Empty className="relative z-10 h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="rounded-lg">
            <FolderOpen />
          </EmptyMedia>
          <EmptyTitle>
            {projects.length === 0 ? 'No Projects Yet' : 'No Project Selected'}
          </EmptyTitle>
          <EmptyDescription>
            {projects.length === 0
              ? 'Start your first ML workflow by creating a new project or importing one.'
              : 'Select a project from the sidebar to continue working, or create/import a new one.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button onClick={() => setIsCreateDialogOpen(true)}>Create Project</Button>
            <Button variant="outline">Import Project</Button>
          </div>
        </EmptyContent>
        <Button
          variant="link"
          asChild
          className="text-muted-foreground"
          size="sm"
        >
          <Link to="/docs">
            Learn More <BookOpen className="h-4 w-4" />
          </Link>
        </Button>
        <ProjectDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
      </Empty>
    </div>
  );
}

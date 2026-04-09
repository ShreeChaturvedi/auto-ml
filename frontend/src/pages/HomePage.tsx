import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@/components/ui/empty';
import { ShootingStars } from '@/components/ui/shooting-stars';
import { StarsBackground } from '@/components/ui/stars-background';
import { HomeEmptyIllustration } from '@/components/ui/illustrations';
import { ProjectDialog } from '@/components/projects/ProjectDialog';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Home page - shown when no project is selected
export function HomePage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  // Fix: Use individual selectors to avoid creating new objects on every render
  const projects = useProjectStore((state) => state.projects);
  const userName = useAuthStore((state) => state.user?.name);
  const firstName = userName?.split(' ')[0];
  const greeting = getGreeting();
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

      {/* Page content — flex column: greeting pinned top-left, empty state centered */}
      <div className="relative z-10 flex h-full flex-col">
        {firstName && (
          <div className="p-8 pb-0 empty-state-enter">
            <h1 className="font-display text-3xl text-foreground">
              {greeting}, <span className="text-gradient-cycle">{firstName}</span>
            </h1>
          </div>
        )}

        <Empty className="flex-1">
          <EmptyHeader>
            <HomeEmptyIllustration className="h-28 w-auto text-muted-foreground empty-state-enter" style={{ animationDelay: '100ms' }} />
            <EmptyTitle className="font-display text-2xl empty-state-enter" style={{ animationDelay: '200ms' }}>
              {projects.length === 0 ? 'No Projects Yet' : 'No Project Selected'}
            </EmptyTitle>
            <EmptyDescription className="empty-state-enter" style={{ animationDelay: '300ms' }}>
              {projects.length === 0
                ? 'Start your first ML workflow by creating a new project or importing one.'
                : 'Select a project from the sidebar to continue working, or create/import a new one.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="empty-state-enter" style={{ animationDelay: '400ms' }}>
            <div className="flex gap-2">
              <Button onClick={() => setIsCreateDialogOpen(true)}>Create Project</Button>
              <Button variant="outline">Import Project</Button>
            </div>
          </EmptyContent>
          <Button
            variant="link"
            asChild
            className="text-muted-foreground empty-state-enter"
            size="sm"
            style={{ animationDelay: '500ms' }}
          >
            <Link to="/docs">
              Learn More <BookOpen className="h-4 w-4" />
            </Link>
          </Button>
          <ProjectDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
        </Empty>
      </div>
    </div>
  );
}

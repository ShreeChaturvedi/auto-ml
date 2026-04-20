import { useState, useLayoutEffect, useMemo } from 'react';
import { ArrowUpRight, FolderOpen } from 'lucide-react';
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

/** Build a single loop at position lx, returning path segments. */
function loopAt(lx: number, j: () => number): string[] {
  return [
    `C ${lx - 7} ${17 + j()}, ${lx - 3} 16, ${lx} 13`,
    `C ${lx + 4} ${3 + j()}, ${lx + 8} ${1 + j()}, ${lx + 11} ${7 + j() * 0.3}`,
    `C ${lx + 14} ${13 + j()}, ${lx + 9} 16, ${lx + 5} 13`,
    `C ${lx + 1} ${10 + j()}, ${lx + 5} ${6 + j()}, ${lx + 11} ${10 + j()}`,
  ];
}

/** Generate a hand-drawn flourish path with 1–2 loops. Different each time. */
function generateFlourish(): string {
  const j = () => +(Math.random() * 5 - 2.5).toFixed(1); // ±2.5px jitter
  const twoLoops = Math.random() > 0.5;

  if (twoLoops) {
    const l1 = 75 + Math.round(Math.random() * 20 - 10);  // first loop ~65–85
    const l2 = 150 + Math.round(Math.random() * 20 - 10); // second loop ~140–160
    return [
      `M 0 ${14 + j()}`,
      `C 18 ${18 + j()}, 38 ${10 + j()}, ${l1 - 12} ${16 + j()}`,
      ...loopAt(l1, j),
      `C ${l1 + 22} ${16 + j()}, ${l2 - 18} ${10 + j()}, ${l2 - 12} ${16 + j()}`,
      ...loopAt(l2, j),
      `C ${Math.min(l2 + 25, 180)} ${14 + j()}, 192 ${18 + j()}, 200 ${12 + j()}`,
    ].join(' ');
  }

  const lx = 127 + Math.round(Math.random() * 40 - 20); // loop center ±20px
  return [
    `M 0 ${14 + j()}`,
    `C 20 ${18 + j()}, 45 ${10 + j()}, 70 ${16 + j()}`,
    `C 85 ${18 + j()}, 100 ${12 + j()}, ${lx - 12} ${16 + j()}`,
    ...loopAt(lx, j),
    `C ${Math.min(lx + 28, 178)} ${14 + j()}, ${Math.min(lx + 55, 192)} ${18 + j()}, 200 ${12 + j()}`,
  ].join(' ');
}

// Home page - shown when no project is selected
export function HomePage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  // Fix: Use individual selectors to avoid creating new objects on every render
  const projects = useProjectStore((state) => state.projects);
  const userName = useAuthStore((state) => state.user?.name);
  const firstName = userName?.split(' ')[0];
  const greeting = getGreeting();
  const flourishPath = useMemo(() => generateFlourish(), []);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const isInitialized = useProjectStore((state) => state.isInitialized);
  const isLoading = useProjectStore((state) => state.isLoading);
  const error = useProjectStore((state) => state.error);

  // Clear the active project before the first Home paint so the sidebar
  // never flashes the previous project's phase tree on the root route.
  useLayoutEffect(() => {
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
          <div className="flex h-14 items-center px-8 empty-state-enter">
            <h1 className="relative inline-block font-display text-3xl text-foreground">
              {greeting}, <span className="text-gradient-cycle">{firstName}</span>
              <svg
                viewBox="0 0 200 20"
                fill="none"
                preserveAspectRatio="none"
                className="absolute left-0 top-full h-4 w-full text-foreground"
                aria-hidden="true"
              >
                <path
                  d={flourishPath}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  fill="none"
                  pathLength={1}
                  className="stroke-draw-on-off"
                  style={{ animationDelay: '300ms' }}
                />
              </svg>
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
                ? 'Start your first ML workflow by creating a new project.'
                : 'Select a project from the sidebar to continue working, or create a new one.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="empty-state-enter" style={{ animationDelay: '400ms' }}>
            <Button onClick={() => setIsCreateDialogOpen(true)}>Create Project</Button>
          </EmptyContent>
          <a
            className="empty-state-enter inline-flex items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{ animationDelay: '500ms' }}
            href="https://agentic-automl.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Learn More (opens landing page in new tab)"
          >
            Learn More <ArrowUpRight className="h-4 w-4" />
          </a>
          <ProjectDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
        </Empty>
      </div>
    </div>
  );
}

import { useEffect, useRef, useMemo } from 'react';
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { ProjectWorkspace } from '@/pages/ProjectWorkspace';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { enableDemoMode } from '@/lib/demoMode';

import type { Phase } from '@/types/phase';

import { DEFAULT_PHASE, DEMO_PROJECT_ID, resetLandingDemoState } from './demoState';
import './demoWorkspace.css';

export interface DemoWorkspaceProps {
  initialPhase?: Phase;
  phase?: Phase;
  initialEntry?: string;
}

function DemoWorkspaceRouteSync({ phase }: { phase: Phase }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const nextPath = `/project/${DEMO_PROJECT_ID}/${phase}`;
    if (location.pathname !== nextPath) {
      navigate(nextPath, { replace: true });
    }
  }, [location.pathname, navigate, phase]);

  return null;
}

export function DemoWorkspace({
  initialPhase = DEFAULT_PHASE,
  phase,
  initialEntry,
}: DemoWorkspaceProps) {
  const initialEntries = useMemo(
    () => [initialEntry ?? `/project/${DEMO_PROJECT_ID}/${initialPhase}`],
    [initialEntry, initialPhase],
  );

  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    enableDemoMode();
    resetLandingDemoState();
    initializedRef.current = true;
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="automl-ui-theme">
      <TooltipProvider delayDuration={300}>
        <MemoryRouter initialEntries={initialEntries}>
          <div
            className="landing-demo-workspace h-full bg-background text-foreground"
            data-testid="landing-demo-workspace"
          >
            <AppShell viewportMode="container">
              {phase ? <DemoWorkspaceRouteSync phase={phase} /> : null}
              <Routes>
                <Route path="/project/:projectId" element={<Navigate to={`/project/${DEMO_PROJECT_ID}/${initialPhase}`} replace />} />
                <Route path="/project/:projectId/:phase" element={<ProjectWorkspace />} />
                <Route path="*" element={<Navigate to={`/project/${DEMO_PROJECT_ID}/${initialPhase}`} replace />} />
              </Routes>
            </AppShell>
          </div>
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}

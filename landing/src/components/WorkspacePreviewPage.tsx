import { useEffect, useMemo, useState } from 'react';

import { DemoWorkspace } from '@frontend/demo/landing';
import { enableDemoMode } from '@frontend/lib/demoMode';
import { preloadProjectWorkspacePhase } from '@frontend/pages/projectWorkspacePhaseLoaders';

import {
  isWorkspacePreviewMessage,
  isWorkspacePreviewPhase,
  WORKSPACE_PREVIEW_READY_MESSAGE_TYPE,
  WORKSPACE_PREVIEW_PHASES,
} from '@/lib/workspacePreviewMessaging';

type Phase =
  | 'upload'
  | 'data-viewer'
  | 'preprocessing'
  | 'feature-engineering'
  | 'training'
  | 'experiments'
  | 'deployment';

function getPhaseFromSearch(): Phase {
  if (typeof window === 'undefined') {
    return 'upload';
  }
  const raw = new URLSearchParams(window.location.search).get('phase');
  return isWorkspacePreviewPhase(raw) ? raw : 'upload';
}

export default function WorkspacePreviewPage() {
  const initialPhase = useMemo(() => getPhaseFromSearch(), []);
  const [phase, setPhase] = useState<Phase>(initialPhase);

  useEffect(() => {
    enableDemoMode();
    window.parent?.postMessage({ type: WORKSPACE_PREVIEW_READY_MESSAGE_TYPE }, '*');
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isWorkspacePreviewMessage(event.data)) return;
      setPhase(event.data.phase);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    preloadProjectWorkspacePhase(phase);

    let cancelled = false;
    const warmAllPhases = () => {
      if (cancelled) return;
      for (const previewPhase of WORKSPACE_PREVIEW_PHASES) {
        if (previewPhase === phase) continue;
        preloadProjectWorkspacePhase(previewPhase);
      }
    };

    const warmId = window.requestAnimationFrame(warmAllPhases);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(warmId);
    };
  }, [phase]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <DemoWorkspace initialPhase={initialPhase} phase={phase} />
    </div>
  );
}

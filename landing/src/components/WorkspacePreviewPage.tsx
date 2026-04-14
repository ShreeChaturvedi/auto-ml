import { useEffect, useMemo } from 'react';

import { DemoWorkspace } from '@frontend/demo/landing';
import { enableDemoMode } from '@frontend/lib/demoMode';

type Phase =
  | 'upload'
  | 'data-viewer'
  | 'preprocessing'
  | 'feature-engineering'
  | 'training'
  | 'experiments'
  | 'deployment';

const VALID_PHASES = new Set<Phase>([
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
  'deployment',
]);

function getPhaseFromSearch(): Phase {
  if (typeof window === 'undefined') {
    return 'upload';
  }
  const raw = new URLSearchParams(window.location.search).get('phase');
  return raw && VALID_PHASES.has(raw as Phase) ? (raw as Phase) : 'upload';
}

export default function WorkspacePreviewPage() {
  const phase = useMemo(() => getPhaseFromSearch(), []);

  useEffect(() => {
    enableDemoMode();
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <DemoWorkspace initialPhase={phase} />
    </div>
  );
}

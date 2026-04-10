import { useEffect, useRef } from 'react';
import './preview.css';
import type { WorkflowPhase } from './types';
import { PreviewSidebar } from './PreviewSidebar';
import { PreviewTopbar } from './PreviewTopbar';
import { usePreviewStore } from './previewStore';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { UploadView } from './tabs/UploadView';
import { DataViewerView } from './tabs/DataViewerView';
import { PreprocessingView } from './tabs/PreprocessingView';
import { FeatureEngineeringView } from './tabs/FeatureEngineeringView';
import { TrainingView } from './tabs/TrainingView';
import { ExperimentsView } from './tabs/ExperimentsView';
import { DeploymentView } from './tabs/DeploymentView';

function renderActiveView(activeTab: WorkflowPhase) {
  switch (activeTab) {
    case 'upload':
      return <UploadView />;
    case 'data-viewer':
      return <DataViewerView />;
    case 'preprocessing':
      return <PreprocessingView />;
    case 'feature-engineering':
      return <FeatureEngineeringView />;
    case 'training':
      return <TrainingView />;
    case 'experiments':
      return <ExperimentsView />;
    case 'deployment':
      return <DeploymentView />;
    default: {
      const _exhaustive: never = activeTab;
      return _exhaustive;
    }
  }
}

export function PreviewShell() {
  const activeTab = usePreviewStore((s) => s.activeTab);
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion || !rootRef.current) return;
    if (typeof (rootRef.current as HTMLElement).animate !== 'function') return;

    const root = rootRef.current;
    const sidebar = root.querySelector<HTMLElement>('.preview-sidebar');
    const topbar = root.querySelector<HTMLElement>('.preview-topbar');
    const content = root.querySelector<HTMLElement>('.preview-content');

    // Staged entry sequence (timeline from landing design spec §4.3):
    //   t=0    frame fades in
    //   t=400  sidebar slides + fades in
    //   t=700  topbar fades in
    //   t=1000 main content lifts + fades in
    //   t=1400 interactive glow (handled downstream via CSS)
    const baseOptions: KeyframeAnimationOptions = {
      duration: 500,
      easing: 'cubic-bezier(0.165, 0.84, 0.44, 1)', // ease-out-quart
      fill: 'forwards',
    };

    root.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { ...baseOptions, duration: 400, delay: 0 },
    );
    sidebar?.animate(
      [
        { opacity: 0, transform: 'translateX(-8px)' },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { ...baseOptions, delay: 400 },
    );
    topbar?.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { ...baseOptions, delay: 700 },
    );
    content?.animate(
      [
        { opacity: 0, transform: 'translateY(2px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { ...baseOptions, delay: 1000, duration: 600 },
    );
  }, [reducedMotion]);

  return (
    <div
      ref={rootRef}
      className="preview-root"
      role="application"
      aria-label="Agentic AutoML Platform demo"
    >
      <PreviewSidebar />
      <PreviewTopbar />
      <main
        className="preview-content"
        id={`preview-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`preview-tab-${activeTab}`}
      >
        {renderActiveView(activeTab)}
      </main>
    </div>
  );
}

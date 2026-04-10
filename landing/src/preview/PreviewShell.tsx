import { Suspense, lazy, useEffect, useRef } from 'react';
import './preview.css';
import type { WorkflowPhase } from './types';
import { PreviewSidebar } from './PreviewSidebar';
import { PreviewTopbar } from './PreviewTopbar';
import { usePreviewStore } from './previewStore';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

// Tab views are lazy-split so the initial AppPreviewFrame island only ships
// the default (Data Viewer) tab. The other six tabs are fetched on demand
// when the user clicks into them. This keeps the first-paint bundle lean
// while preserving the exhaustive switch below.
const UploadView = lazy(() =>
  import('./tabs/UploadView').then((m) => ({ default: m.UploadView })),
);
const DataViewerView = lazy(() =>
  import('./tabs/DataViewerView').then((m) => ({ default: m.DataViewerView })),
);
const PreprocessingView = lazy(() =>
  import('./tabs/PreprocessingView').then((m) => ({ default: m.PreprocessingView })),
);
const FeatureEngineeringView = lazy(() =>
  import('./tabs/FeatureEngineeringView').then((m) => ({
    default: m.FeatureEngineeringView,
  })),
);
const TrainingView = lazy(() =>
  import('./tabs/TrainingView').then((m) => ({ default: m.TrainingView })),
);
const ExperimentsView = lazy(() =>
  import('./tabs/ExperimentsView').then((m) => ({ default: m.ExperimentsView })),
);
const DeploymentView = lazy(() =>
  import('./tabs/DeploymentView').then((m) => ({ default: m.DeploymentView })),
);

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
    // fill: 'both' clamps each element to its first keyframe immediately on
    // animation start AND holds the final keyframe once the animation ends.
    // This is critical: preview.css ships the elements at opacity:0 for the
    // initial render (prevents hydration pop-in), and 'both' guarantees the
    // WAAPI takes over that 0→1 fade even before the delay window elapses.
    const baseOptions: KeyframeAnimationOptions = {
      duration: 500,
      easing: 'cubic-bezier(0.165, 0.84, 0.44, 1)', // ease-out-quart
      fill: 'both',
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
        <Suspense fallback={<div className="preview-suspense" aria-hidden />}>
          {renderActiveView(activeTab)}
        </Suspense>
      </main>
    </div>
  );
}

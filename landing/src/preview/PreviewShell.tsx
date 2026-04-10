import './preview.css';
import type { WorkflowPhase } from './types';
import { PreviewSidebar } from './PreviewSidebar';
import { PreviewTopbar } from './PreviewTopbar';
import { usePreviewStore } from './previewStore';
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

  return (
    <div className="preview-root" role="application" aria-label="Agentic AutoML Platform demo">
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

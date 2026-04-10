import './preview.css';
import { PreviewSidebar } from './PreviewSidebar';
import { PreviewTopbar } from './PreviewTopbar';
import { usePreviewStore } from './previewStore';

// Per-tab view components will be added in Phase 6.
// For now, render a placeholder so the shell compiles.
const PlaceholderView = ({ phase }: { phase: string }) => (
  <div className="preview-placeholder" role="status">
    <p className="preview-placeholder-label">{phase.toUpperCase()}</p>
    <p className="preview-placeholder-text">Tab view scaffolding…</p>
  </div>
);

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
        <PlaceholderView phase={activeTab} />
      </main>
    </div>
  );
}

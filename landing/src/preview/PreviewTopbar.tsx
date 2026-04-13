import { Bell, Settings, Palette } from 'lucide-react';
import { usePreviewStore } from './previewStore';

const PHASE_LABELS: Record<string, string> = {
  'upload':               'Upload',
  'data-viewer':          'Data Viewer',
  'preprocessing':        'Preprocessing',
  'feature-engineering':  'Feature Engineering',
  'training':             'Training',
  'experiments':          'Experiments',
  'deployment':           'Deployment',
};

export function PreviewTopbar() {
  const activeTab = usePreviewStore((s) => s.activeTab);
  const user = usePreviewStore((s) => s.fakeUser);

  return (
    <header className="preview-topbar">
      <div className="preview-topbar-breadcrumb">
        <span className="preview-topbar-phase">{PHASE_LABELS[activeTab]}</span>
      </div>

      <div className="preview-topbar-actions">
        <button type="button" className="preview-topbar-icon" aria-label="Theme">
          <Palette size={14} aria-hidden="true" />
        </button>
        <button type="button" className="preview-topbar-icon" aria-label="Notifications">
          <Bell size={14} aria-hidden="true" />
        </button>
        <button type="button" className="preview-topbar-icon" aria-label="Settings">
          <Settings size={14} aria-hidden="true" />
        </button>
        <div className="preview-topbar-avatar" aria-label={user.name}>
          {user.name.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}

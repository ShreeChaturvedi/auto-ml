import {
  Upload, Database, SlidersHorizontal, Sparkles, Brain, LineChart, Rocket,
  ChevronDown, Plus, Check,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreviewStore } from './previewStore';
import type { WorkflowPhase } from './types';

interface PhaseDef {
  id: WorkflowPhase;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const PHASES: PhaseDef[] = [
  { id: 'upload',               label: 'Upload',               icon: Upload },
  { id: 'data-viewer',          label: 'Data Viewer',          icon: Database },
  { id: 'preprocessing',        label: 'Preprocessing',        icon: SlidersHorizontal },
  { id: 'feature-engineering',  label: 'Feature Engineering',  icon: Sparkles },
  { id: 'training',             label: 'Training',             icon: Brain },
  { id: 'experiments',          label: 'Experiments',          icon: LineChart },
  { id: 'deployment',           label: 'Deployment',           icon: Rocket },
];

export function PreviewSidebar() {
  const activeTab = usePreviewStore((s) => s.activeTab);
  const setActiveTab = usePreviewStore((s) => s.setActiveTab);
  const project = usePreviewStore((s) => s.fakeProject);

  return (
    <aside className="preview-sidebar" aria-label="Workspace navigation">
      <div className="preview-sidebar-project">
        <div className="preview-sidebar-project-chip" aria-hidden="true">
          <span className="preview-sidebar-project-dot" />
        </div>
        <div className="preview-sidebar-project-info">
          <span className="preview-sidebar-project-name">{project.name}</span>
          <span className="preview-sidebar-project-meta">active · 7 phases</span>
        </div>
        <ChevronDown size={14} className="preview-sidebar-chevron" aria-hidden="true" />
      </div>

      <div className="preview-sidebar-section-label">Workflow</div>
      <nav className="preview-sidebar-phase-list" role="tablist" aria-orientation="vertical">
        {PHASES.map((phase, idx) => {
          const Icon = phase.icon;
          const isActive = activeTab === phase.id;
          return (
            <button
              key={phase.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`preview-panel-${phase.id}`}
              className={cn('preview-sidebar-phase', isActive && 'is-active')}
              onClick={() => setActiveTab(phase.id)}
            >
              <span className="preview-sidebar-phase-index">{idx + 1}</span>
              <Icon size={14} className="preview-sidebar-phase-icon" aria-hidden="true" />
              <span className="preview-sidebar-phase-label">{phase.label}</span>
              <Check size={12} className="preview-sidebar-phase-check" aria-hidden="true" />
            </button>
          );
        })}
      </nav>

      <div className="preview-sidebar-section-label">Projects</div>
      <button type="button" className="preview-sidebar-new-project">
        <Plus size={14} aria-hidden="true" />
        <span>New project</span>
      </button>
    </aside>
  );
}

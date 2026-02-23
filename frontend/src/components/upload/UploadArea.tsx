import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';

import { PlanningStage } from './PlanningStage';
import { ProcessingStage } from './ProcessingStage';
import { ProjectHeader } from './ProjectHeader';
import { UploadStage } from './UploadStage';

type UploadFlowStage = 'upload' | 'processing' | 'chat';

const STAGE_ORDER: UploadFlowStage[] = ['upload', 'processing', 'chat'];

interface UploadFlowMetadata {
  uploadStage?: UploadFlowStage;
  projectPlan?: string;
  projectPlanName?: string;
  customInstructions?: string;
  [key: string]: unknown;
}

function isValidUploadStage(value: unknown): value is UploadFlowStage {
  return typeof value === 'string' && STAGE_ORDER.includes(value as UploadFlowStage);
}

export function UploadArea() {
  const navigate = useNavigate();

  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const updateProject = useProjectStore((state) => state.updateProject);
  const completePhase = useProjectStore((state) => state.completePhase);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

  const activeProject = useMemo(
    () => (activeProjectId ? projects.find((project) => project.id === activeProjectId) : undefined),
    [activeProjectId, projects]
  );

  const [stage, setStage] = useState<UploadFlowStage>('upload');
  const initializedProjectIdRef = useRef<string | null>(null);
  const persistedMetadataRef = useRef<string>('');

  useEffect(() => {
    if (!activeProjectId) return;
    void hydrateFromBackend(activeProjectId);
  }, [activeProjectId, hydrateFromBackend]);

  useEffect(() => {
    if (!activeProject) return;
    if (initializedProjectIdRef.current === activeProject.id) return;

    const metadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    const nextStage = isValidUploadStage(metadata.uploadStage) ? metadata.uploadStage : 'upload';

    setStage(nextStage);
    persistedMetadataRef.current = JSON.stringify({ uploadStage: nextStage });
    initializedProjectIdRef.current = activeProject.id;
  }, [activeProject]);

  useEffect(() => {
    if (!activeProject) return;
    if (initializedProjectIdRef.current !== activeProject.id) return;

    const snapshot = JSON.stringify({ uploadStage: stage });
    if (snapshot === persistedMetadataRef.current) return;
    persistedMetadataRef.current = snapshot;

    const existingMetadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    void updateProject(activeProject.id, {
      metadata: { ...existingMetadata, uploadStage: stage },
    }).catch((error) => {
      console.error('Failed to persist upload stage metadata', error);
    });
  }, [activeProject, stage, updateProject]);

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">No Active Project</h3>
            <p className="text-sm text-muted-foreground">
              Please select or create a project from the sidebar to upload data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="upload-area">
      <ProjectHeader
        project={activeProject}
        editable
        onUpdate={(updates) => {
          void updateProject(activeProject.id, updates);
        }}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {stage === 'upload' ? (
          <UploadStage
            projectId={activeProject.id}
            onNext={() => setStage('processing')}
          />
        ) : null}

        {stage === 'processing' ? (
          <ProcessingStage
            projectId={activeProject.id}
            onBack={() => setStage('upload')}
            onComplete={() => setStage('chat')}
          />
        ) : null}

        {stage === 'chat' ? (
          <PlanningStage
            projectId={activeProject.id}
            onBack={() => setStage('upload')}
            onPlanApproved={(plan, planName) => {
              const metadata = { ...((activeProject.metadata ?? {}) as UploadFlowMetadata) };
              delete metadata.customInstructions;

              void updateProject(activeProject.id, {
                metadata: {
                  ...metadata,
                  uploadStage: 'chat',
                  projectPlan: plan,
                  projectPlanName: planName,
                },
              })
                .then(() => {
                  completePhase(activeProject.id, 'upload');
                  navigate(`/project/${activeProject.id}/data-viewer`);
                })
                .catch((error) => {
                  console.error('Failed to save approved plan', error);
                });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

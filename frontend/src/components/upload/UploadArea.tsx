import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';

import { PlanningStage } from './PlanningStage';
import { ProcessingStage } from './ProcessingStage';
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
  const [searchParams, setSearchParams] = useSearchParams();

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
  const syncingFromMetadataRef = useRef(false);

  useEffect(() => {
    if (!activeProjectId) return;
    void hydrateFromBackend(activeProjectId);
  }, [activeProjectId, hydrateFromBackend]);

  useEffect(() => {
    if (!activeProject) return;

    const metadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    const nextStage = isValidUploadStage(metadata.uploadStage) ? metadata.uploadStage : 'upload';

    const snapshot = JSON.stringify({ uploadStage: nextStage });
    const hasProjectChanged = initializedProjectIdRef.current !== activeProject.id;
    const hasMetadataStageChanged = snapshot !== persistedMetadataRef.current;

    if (!hasProjectChanged && !hasMetadataStageChanged) {
      return;
    }

    syncingFromMetadataRef.current = true;
    setStage(nextStage);
    persistedMetadataRef.current = snapshot;
    initializedProjectIdRef.current = activeProject.id;
  }, [activeProject]);

  useEffect(() => {
    if (!activeProject) return;
    if (searchParams.get('newPlan') !== '1') return;

    setStage('chat');

    const existingMetadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    void updateProject(activeProject.id, {
      metadata: { ...existingMetadata, uploadStage: 'chat' },
    }).catch((error) => {
      console.error('Failed to persist new-plan stage metadata', error);
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('newPlan');
    setSearchParams(nextParams, { replace: true });
  }, [activeProject, searchParams, setSearchParams, updateProject]);

  useEffect(() => {
    if (!activeProject) return;
    if (initializedProjectIdRef.current !== activeProject.id) return;

    const metadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    const metadataStage = isValidUploadStage(metadata.uploadStage) ? metadata.uploadStage : 'upload';

    if (syncingFromMetadataRef.current) {
      if (stage === metadataStage) {
        syncingFromMetadataRef.current = false;
      }
      return;
    }

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
      {/* Compact header for non-upload stages */}
      {stage !== 'upload' && (
        <div className="flex h-14 items-center border-b px-4 shrink-0 bg-card/50 backdrop-blur-sm sm:px-8">
          <p className="truncate text-sm text-muted-foreground flex-1 min-w-0">
            {activeProject.description || activeProject.title}
          </p>
          {stage === 'chat' && (
            <Button variant="ghost" size="sm" onClick={() => setStage('upload')} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {stage === 'upload' ? (
          <UploadStage
            projectId={activeProject.id}
            onNext={() => setStage('processing')}
          />
        ) : null}

        {stage === 'processing' ? (
          <ProcessingStage
            projectId={activeProject.id}
            onComplete={() => setStage('chat')}
          />
        ) : null}

        {stage === 'chat' ? (
          <PlanningStage
            projectId={activeProject.id}
            onPlanApproved={(plan, planName) => {
              const metadata = { ...((activeProject.metadata ?? {}) as UploadFlowMetadata) };
              delete metadata.customInstructions;

              // Append new plan to metadata
              const newPlan = { id: `plan-${Date.now()}`, name: planName, content: plan };
              const existingPlans = Array.isArray(metadata.plans) ? metadata.plans : [];

              // Maintain backward compat
              const legacyCompat = {
                projectPlan: plan,
                projectPlanName: planName,
              };

              void updateProject(activeProject.id, {
                metadata: {
                  ...metadata,
                  ...legacyCompat,
                  plans: [...existingPlans, newPlan],
                  activePlanId: newPlan.id,
                  uploadStage: 'upload',
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

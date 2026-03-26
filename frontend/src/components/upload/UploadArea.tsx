import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlanChatStore } from '@/stores/planChatStore';

import { PlanningStage } from './PlanningStage';
import { ProcessingStage } from './ProcessingStage';
import { UploadStage } from './UploadStage';
import { getNextPlanName } from './planningUtils';

type UploadFlowStage = 'upload' | 'processing' | 'chat';

const STAGE_ORDER: UploadFlowStage[] = ['upload', 'processing', 'chat'];

interface UploadFlowMetadata {
  uploadStage?: UploadFlowStage;
  projectPlan?: string;
  projectPlanName?: string;
  customInstructions?: string;
  activePlanChatId?: string;
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

  const createChat = usePlanChatStore((s) => s.createChat);
  const completeStoreChat = usePlanChatStore((s) => s.completeChat);

  const activeProject = useMemo(
    () => (activeProjectId ? projects.find((project) => project.id === activeProjectId) : undefined),
    [activeProjectId, projects]
  );

  const [stage, setStage] = useState<UploadFlowStage>('upload');
  const [activePlanChatId, setActivePlanChatId] = useState<string | null>(null);
  const initializedProjectIdRef = useRef<string | null>(null);
  const persistedMetadataRef = useRef<string>('');
  const syncingFromMetadataRef = useRef(false);

  useEffect(() => {
    if (!activeProjectId) return;
    void hydrateFromBackend(activeProjectId);
  }, [activeProjectId, hydrateFromBackend]);

  // Reset chat when project changes
  useEffect(() => {
    setActivePlanChatId(null);
  }, [activeProjectId]);

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

    // Restore persisted active chat ID
    if (metadata.activePlanChatId) {
      const chat = usePlanChatStore.getState().chats[metadata.activePlanChatId];
      if (chat?.status === 'in_progress') {
        setActivePlanChatId(metadata.activePlanChatId);
      }
    }
  }, [activeProject]);

  // Handle ?newPlan=1 — create chat and start processing
  useEffect(() => {
    if (!activeProject) return;
    if (searchParams.get('newPlan') !== '1') return;

    // Count existing plans and chats for naming
    const metadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    const existingPlans = Array.isArray(metadata.plans) ? metadata.plans : [];
    const inProgressChats = usePlanChatStore.getState().getInProgressChats(activeProject.id);
    const chatName = getNextPlanName(existingPlans, inProgressChats);
    const chat = createChat(activeProject.id, chatName);
    setActivePlanChatId(chat.id);

    setStage('processing');

    const existingMetadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    void updateProject(activeProject.id, {
      metadata: { ...existingMetadata, uploadStage: 'processing', activePlanChatId: chat.id },
    }).catch((error) => {
      console.error('Failed to persist new-plan stage metadata', error);
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('newPlan');
    setSearchParams(nextParams, { replace: true });
  }, [activeProject, searchParams, setSearchParams, updateProject, createChat]);

  // Handle ?chatId=xxx — resume an in-progress chat
  useEffect(() => {
    const chatId = searchParams.get('chatId');
    if (!chatId || !activeProject) return;

    const chat = usePlanChatStore.getState().chats[chatId];
    if (chat && chat.projectId === activeProject.id && chat.status === 'in_progress') {
      setActivePlanChatId(chatId);
      setStage('chat');

      const existingMetadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
      void updateProject(activeProject.id, {
        metadata: { ...existingMetadata, uploadStage: 'chat', activePlanChatId: chatId },
      }).catch(() => {});
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('chatId');
    setSearchParams(nextParams, { replace: true });
  }, [activeProject, searchParams, setSearchParams, updateProject]);

  // Restore chat when entering chat stage without one
  useEffect(() => {
    if (stage !== 'chat' || activePlanChatId || !activeProject) return;
    const chats = usePlanChatStore.getState().getInProgressChats(activeProject.id);
    if (chats.length > 0) {
      setActivePlanChatId(chats[0].id);
    }
  }, [stage, activePlanChatId, activeProject]);

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
            planChatId={activePlanChatId}
            onPlanApproved={(plan, planName) => {
              const metadata = { ...((activeProject.metadata ?? {}) as UploadFlowMetadata) };
              delete metadata.customInstructions;

              // Complete the chat entry in store
              const newPlanId = `plan-${Date.now()}`;
              if (activePlanChatId) {
                completeStoreChat(activePlanChatId, newPlanId, planName);
                setActivePlanChatId(null);
              }

              // Append new plan to metadata
              const newPlan = { id: newPlanId, name: planName, content: plan };
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
                  activePlanChatId: undefined,
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

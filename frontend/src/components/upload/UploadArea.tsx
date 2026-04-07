import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlanChatStore } from '@/stores/planChatStore';

import { ProcessingStage } from './ProcessingStage';
import { UploadStage } from './UploadStage';
import { getNextPlanName } from './planningUtils';
import type { ProjectPlan } from '@/hooks/useProjectPlans';

type UploadFlowStage = 'upload' | 'processing';

const STAGE_ORDER: UploadFlowStage[] = ['upload', 'processing'];

interface UploadFlowMetadata {
  uploadStage?: string;
  projectPlan?: string;
  projectPlanName?: string;
  customInstructions?: string;
  activePlanChatId?: string | null;
  plans?: unknown[];
  [key: string]: unknown;
}

function isValidUploadStage(value: unknown): value is UploadFlowStage {
  return typeof value === 'string' && STAGE_ORDER.includes(value as UploadFlowStage);
}

function getPersistedPlanChatId(metadata: UploadFlowMetadata): string | null {
  return typeof metadata.activePlanChatId === 'string' && metadata.activePlanChatId.length > 0
    ? metadata.activePlanChatId
    : null;
}

export function UploadArea() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const updateProject = useProjectStore((state) => state.updateProject);
  const completePhase = useProjectStore((state) => state.completePhase);

  const createChat = usePlanChatStore((s) => s.createChat);
  const completeStoreChat = usePlanChatStore((s) => s.completeChat);
  const isInitialized = usePlanChatStore((s) => s.isInitialized);

  const activeProject = useMemo(
    () => (activeProjectId ? projects.find((project) => project.id === activeProjectId) : undefined),
    [activeProjectId, projects]
  );

  const [stage, setStage] = useState<UploadFlowStage>('upload');
  const [activePlanChatId, setActivePlanChatId] = useState<string | null>(null);
  const initializedProjectIdRef = useRef<string | null>(null);
  const persistedStageRef = useRef<UploadFlowStage>('upload');
  const syncingFromMetadataRef = useRef(false);
  const creatingPlanRef = useRef(false);


  useEffect(() => {
    if (!activeProjectId) return;
    void useDataStore.getState().hydrateFromBackend(activeProjectId);
  }, [activeProjectId]);

  // Reset chat when project changes
  useEffect(() => {
    setActivePlanChatId(null);
  }, [activeProjectId]);

  // Restore stage + active chat from metadata on project load
  useEffect(() => {
    if (!activeProject) return;

    const metadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    const rawStage = metadata.uploadStage;
    const nextStage = isValidUploadStage(rawStage) ? rawStage : 'upload';
    const hasProjectChanged = initializedProjectIdRef.current !== activeProject.id;
    const hasStageChanged = persistedStageRef.current !== nextStage;

    if (hasProjectChanged || hasStageChanged) {
      syncingFromMetadataRef.current = true;
      setStage(nextStage);
      persistedStageRef.current = nextStage;
      initializedProjectIdRef.current = activeProject.id;
    }

    // Only restore chat on project init (not every metadata change)
    if (hasProjectChanged && isInitialized) {
      const persistedPlanChatId = getPersistedPlanChatId(metadata);
      if (persistedPlanChatId) {
        const chat = usePlanChatStore.getState().chats[persistedPlanChatId];
        if (chat?.status === 'in_progress') {
          setActivePlanChatId(persistedPlanChatId);
        } else {
          setActivePlanChatId(null);
        }
      }
    }
  }, [activeProject, isInitialized, updateProject]);

  // Handle ?newPlan=1
  useEffect(() => {
    if (!activeProject || !isInitialized) return;
    if (searchParams.get('newPlan') !== '1') {
      creatingPlanRef.current = false;
      return;
    }
    if (creatingPlanRef.current) return;
    creatingPlanRef.current = true;

    void (async () => {
      const metadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
      const existingPlans = Array.isArray(metadata.plans) ? (metadata.plans as ProjectPlan[]) : [];
      const inProgressChats = usePlanChatStore.getState().getInProgressChats(activeProject.id);
      const chatName = getNextPlanName(existingPlans, inProgressChats);
      const chat = await createChat(activeProject.id, chatName);

      setActivePlanChatId(chat.id);

      if (existingPlans.length > 0) {
        const existingMetadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
        void updateProject(activeProject.id, {
          metadata: { ...existingMetadata, uploadStage: 'upload', activePlanChatId: chat.id },
        }).catch(() => {});
      } else {
        setStage('processing');
        persistedStageRef.current = 'processing';
        const existingMetadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
        void updateProject(activeProject.id, {
          metadata: { ...existingMetadata, uploadStage: 'processing', activePlanChatId: chat.id },
        }).catch(() => {});
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('newPlan');
      setSearchParams(nextParams, { replace: true });
    })();
  }, [activeProject, isInitialized, searchParams, setSearchParams, updateProject, createChat]);

  // Handle ?chatId=xxx — resume an in-progress chat
  useEffect(() => {
    const chatId = searchParams.get('chatId');
    if (!chatId || !activeProject || !isInitialized) return;

    void (async () => {
      const store = usePlanChatStore.getState();
      let chat = store.chats[chatId];

      if (!chat || chat.messages.length === 0) {
        const loaded = await store.loadFullChat(activeProject.id, chatId);
        if (loaded) chat = loaded;
      }

      if (chat && chat.projectId === activeProject.id && chat.status === 'in_progress') {
        setActivePlanChatId(chatId);
        const existingMeta = (activeProject.metadata ?? {}) as UploadFlowMetadata;
        void updateProject(activeProject.id, {
          metadata: { ...existingMeta, uploadStage: 'upload', activePlanChatId: chatId },
        }).catch(() => {});
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('chatId');
      setSearchParams(nextParams, { replace: true });
    })();
  }, [activeProject, isInitialized, searchParams, setSearchParams, updateProject]);

  // Handle ?planId=xxx — switch to viewing a completed plan (clears active chat)
  useEffect(() => {
    const planId = searchParams.get('planId');
    if (!planId) return;

    // handleOpenPlan already persisted activePlanChatId: null to metadata — just clear local state
    setActivePlanChatId(null);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('planId');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Persist stage changes to metadata
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

    if (stage === persistedStageRef.current) return;
    persistedStageRef.current = stage;

    const existingMetadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
    void updateProject(activeProject.id, {
      metadata: { ...existingMetadata, uploadStage: stage },
    }).catch(() => {});
  }, [activeProject, stage, updateProject]);

  // onFirstUpload: create chat + start processing animation
  const handleFirstUpload = useMemo(() => {
    let called = false;
    return () => {
      if (called || !activeProject) return;
      called = true;
      void (async () => {
        const metadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
        const existingPlans = Array.isArray(metadata.plans) ? (metadata.plans as ProjectPlan[]) : [];
        const inProgressChats = usePlanChatStore.getState().getInProgressChats(activeProject.id);
        const chatName = getNextPlanName(existingPlans, inProgressChats);
        const chat = await createChat(activeProject.id, chatName);
        setActivePlanChatId(chat.id);

        setStage('processing');
        persistedStageRef.current = 'processing';

        const existingMetadata = (activeProject.metadata ?? {}) as UploadFlowMetadata;
        void updateProject(activeProject.id, {
          metadata: { ...existingMetadata, uploadStage: 'processing', activePlanChatId: chat.id },
        }).catch(() => {});
      })();
    };
  }, [activeProject, createChat, updateProject]);

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

  const handlePlanApproved = (plan: string, planName: string) => {
    const metadata = { ...((activeProject.metadata ?? {}) as UploadFlowMetadata) };
    delete metadata.customInstructions;

    const newPlanId = `plan-${Date.now()}`;
    const newPlan = { id: newPlanId, name: planName, content: plan };
    const existingPlans = Array.isArray(metadata.plans) ? (metadata.plans as ProjectPlan[]) : [];

    const legacyCompat = { projectPlan: plan, projectPlanName: planName };

    const completeChatPromise = activePlanChatId
      ? completeStoreChat(activePlanChatId, newPlanId, planName).catch((err) => {
          console.error('Failed to complete chat', err);
        })
      : Promise.resolve();

    const updateProjectPromise = updateProject(activeProject.id, {
      metadata: {
        ...metadata,
        ...legacyCompat,
        plans: [...existingPlans, newPlan],
        activePlanId: newPlan.id,
        activePlanChatId: null,
        uploadStage: 'upload',
      },
    });
    persistedStageRef.current = 'upload';

    void Promise.all([completeChatPromise, updateProjectPromise])
      .then(() => {
        setActivePlanChatId(null);
        completePhase(activeProject.id, 'upload');
      })
      .catch((error) => {
        console.error('Failed to save approved plan', error);
      });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="upload-area">
      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {stage === 'upload' ? (
          <UploadStage
            projectId={activeProject.id}
            activePlanChatId={activePlanChatId}
            onPlanApproved={handlePlanApproved}
            onFirstUpload={handleFirstUpload}
          />
        ) : null}

        {stage === 'processing' ? (
          <ProcessingStage
            projectId={activeProject.id}
            onComplete={() => setStage('upload')}
          />
        ) : null}
      </div>
    </div>
  );
}

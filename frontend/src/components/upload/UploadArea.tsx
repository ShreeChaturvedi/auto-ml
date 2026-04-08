import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { usePlanChatStore } from '@/stores/planChatStore';

import { ProcessingStage } from './ProcessingStage';
import { UploadStage } from './UploadStage';
import { getNextPlanName } from './planningUtils';
import { getActivePlanChatId, type ProjectPlan } from '@/hooks/useProjectPlans';

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

function getMeta(project: { metadata?: unknown }): UploadFlowMetadata {
  return (project.metadata ?? {}) as UploadFlowMetadata;
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
  const firstUploadCalledRef = useRef(false);

  /** Create a new plan chat, set it active, and persist to metadata. */
  const startNewChat = useCallback(async (
    project: NonNullable<typeof activeProject>,
    opts: { showProcessing: boolean },
  ) => {
    const meta = getMeta(project);
    const existingPlans = Array.isArray(meta.plans) ? (meta.plans as ProjectPlan[]) : [];
    const inProgressChats = usePlanChatStore.getState().getInProgressChats(project.id);
    const chat = await createChat(project.id, getNextPlanName(existingPlans, inProgressChats));

    setActivePlanChatId(chat.id);

    if (opts.showProcessing) {
      setStage('processing');
      persistedStageRef.current = 'processing';
    }

    void updateProject(project.id, {
      metadata: {
        ...getMeta(project),
        uploadStage: opts.showProcessing ? 'processing' : 'upload',
        activePlanChatId: chat.id,
      },
    }).catch(() => {});
  }, [createChat, updateProject]);

  useEffect(() => {
    if (!activeProjectId) return;
    void useDataStore.getState().hydrateFromBackend(activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    setActivePlanChatId(null);
    firstUploadCalledRef.current = false;
  }, [activeProjectId]);

  // Restore stage + active chat from metadata on project load
  useEffect(() => {
    if (!activeProject) return;

    const meta = getMeta(activeProject);
    const nextStage = isValidUploadStage(meta.uploadStage) ? meta.uploadStage : 'upload';
    const hasProjectChanged = initializedProjectIdRef.current !== activeProject.id;
    const hasStageChanged = persistedStageRef.current !== nextStage;

    if (hasProjectChanged || hasStageChanged) {
      syncingFromMetadataRef.current = true;
      setStage(nextStage);
      persistedStageRef.current = nextStage;
      initializedProjectIdRef.current = activeProject.id;
    }

    if (hasProjectChanged && isInitialized) {
      const persisted = getActivePlanChatId(meta);
      if (persisted) {
        const chat = usePlanChatStore.getState().chats[persisted];
        setActivePlanChatId(chat?.status === 'in_progress' ? persisted : null);
      }
    }
  }, [activeProject, isInitialized]);

  // Handle ?newPlan=1
  useEffect(() => {
    if (!activeProject || !isInitialized) return;
    if (searchParams.get('newPlan') !== '1') {
      creatingPlanRef.current = false;
      return;
    }
    if (creatingPlanRef.current) return;
    creatingPlanRef.current = true;

    const meta = getMeta(activeProject);
    const hasExistingPlans = Array.isArray(meta.plans) && meta.plans.length > 0;
    void startNewChat(activeProject, { showProcessing: !hasExistingPlans });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('newPlan');
    setSearchParams(nextParams, { replace: true });
  }, [activeProject, isInitialized, searchParams, setSearchParams, startNewChat]);

  // Handle ?chatId=xxx
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
        void updateProject(activeProject.id, {
          metadata: { ...getMeta(activeProject), uploadStage: 'upload', activePlanChatId: chatId },
        }).catch(() => {});
      }

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('chatId');
      setSearchParams(nextParams, { replace: true });
    })();
  }, [activeProject, isInitialized, searchParams, setSearchParams, updateProject]);

  // Handle ?planId=xxx — handleOpenPlan already persisted to metadata, just clear local state
  useEffect(() => {
    const planId = searchParams.get('planId');
    if (!planId) return;

    setActivePlanChatId(null);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('planId');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Persist stage changes to metadata
  useEffect(() => {
    if (!activeProject) return;
    if (initializedProjectIdRef.current !== activeProject.id) return;

    const metadataStage = isValidUploadStage(getMeta(activeProject).uploadStage)
      ? (getMeta(activeProject).uploadStage as UploadFlowStage)
      : 'upload';

    if (syncingFromMetadataRef.current) {
      if (stage === metadataStage) syncingFromMetadataRef.current = false;
      return;
    }

    if (stage === persistedStageRef.current) return;
    persistedStageRef.current = stage;

    void updateProject(activeProject.id, {
      metadata: { ...getMeta(activeProject), uploadStage: stage },
    }).catch(() => {});
  }, [activeProject, stage, updateProject]);

  const handleFirstUpload = useCallback(() => {
    if (firstUploadCalledRef.current) return;
    const project = useProjectStore.getState().projects.find(
      (p) => p.id === useProjectStore.getState().activeProjectId
    );
    if (!project) return;
    firstUploadCalledRef.current = true;
    void startNewChat(project, { showProcessing: true });
  }, [startNewChat]);

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
    const meta = { ...getMeta(activeProject) };
    delete meta.customInstructions;

    const newPlanId = `plan-${Date.now()}`;
    const newPlan = { id: newPlanId, name: planName, content: plan };
    const existingPlans = Array.isArray(meta.plans) ? (meta.plans as ProjectPlan[]) : [];

    const completeChatPromise = activePlanChatId
      ? completeStoreChat(activePlanChatId, newPlanId, planName).catch(() => {})
      : Promise.resolve();

    const updateProjectPromise = updateProject(activeProject.id, {
      metadata: {
        ...meta,
        projectPlan: plan,
        projectPlanName: planName,
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
      .catch(() => {});
  };

  return (
    <div className="h-full overflow-hidden bg-background" data-testid="upload-area">
      {stage === 'upload' && (
        <UploadStage
          projectId={activeProject.id}
          activePlanChatId={activePlanChatId}
          onPlanApproved={handlePlanApproved}
          onFirstUpload={handleFirstUpload}
        />
      )}
      {stage === 'processing' && (
        <ProcessingStage
          projectId={activeProject.id}
          onComplete={() => setStage('upload')}
        />
      )}
    </div>
  );
}

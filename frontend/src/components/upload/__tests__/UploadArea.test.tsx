import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadArea } from '../UploadArea';

const updateProjectMock = vi.fn(() => Promise.resolve(undefined));
const completePhaseMock = vi.fn();
const hydrateFromBackendMock = vi.fn(() => Promise.resolve());

let projectState: {
  activeProjectId: string | null;
  projects: Array<{
    id: string;
    title: string;
    description?: string;
    icon: string;
    color: 'blue';
    metadata?: Record<string, unknown>;
  }>;
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      ...projectState,
      updateProject: updateProjectMock,
      completePhase: completePhaseMock
    })
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      hydrateFromBackend: hydrateFromBackendMock,
      files: []
    })
}));

// ── Plan chat store mock with controllable state ──────────────────────
const createChatMock = vi.fn((): Promise<unknown> =>
  Promise.resolve({
    id: 'new-chat-1', projectId: 'p1', name: 'Plan 1',
    status: 'in_progress' as const, messages: [], answerHistory: [],
    currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
  })
);
const completeChatMock = vi.fn(() => Promise.resolve());
const loadFullChatMock = vi.fn((): Promise<unknown> => Promise.resolve(null));
const initializeMock = vi.fn(() => Promise.resolve());
const getInProgressChatsMock = vi.fn(() => [] as unknown[]);

let planChatStoreState = {
  chats: {} as Record<string, unknown>,
  isInitialized: true,
};

vi.mock('@/stores/planChatStore', () => ({
  usePlanChatStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        ...planChatStoreState,
        createChat: createChatMock,
        completeChat: completeChatMock,
      }),
    {
      getState: () => ({
        ...planChatStoreState,
        initialize: initializeMock,
        getInProgressChats: getInProgressChatsMock,
        loadFullChat: loadFullChatMock,
      }),
    }
  ),
  selectInProgressChats: () => [],
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>{children}</button>
  )
}));

vi.mock('../UploadStage', () => ({
  UploadStage: ({ onNext }: { onNext: () => void }) => (
    <button type="button" data-testid="upload-stage-next" onClick={onNext}>Upload Next</button>
  )
}));

vi.mock('../ProcessingStage', () => ({
  ProcessingStage: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" data-testid="processing-complete" onClick={onComplete}>Processing Complete</button>
  )
}));

vi.mock('../PlanningStage', () => ({
  PlanningStage: ({ onPlanApproved }: { onPlanApproved: (plan: string, name: string) => void }) => (
    <button type="button" data-testid="plan-approve" onClick={() => onPlanApproved('# Plan', 'bold-falcon-123')}>Approve</button>
  )
}));

function renderUploadArea(initialPath = '/project/p1/upload') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/project/:projectId/upload" element={<UploadArea />} />
        <Route path="/project/:projectId/data-viewer" element={<div data-testid="data-viewer-route" />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('UploadArea stage machine', () => {
  beforeEach(() => {
    updateProjectMock.mockClear();
    completePhaseMock.mockClear();
    hydrateFromBackendMock.mockClear();
    createChatMock.mockClear();
    completeChatMock.mockClear();
    loadFullChatMock.mockClear();
    initializeMock.mockClear();
    getInProgressChatsMock.mockReturnValue([]);

    planChatStoreState = { chats: {}, isInitialized: true };

    projectState = {
      activeProjectId: 'p1',
      projects: [{
        id: 'p1',
        title: 'Project 1',
        description: 'desc',
        icon: 'Folder',
        color: 'blue',
        metadata: {}
      }]
    };
  });

  it('transitions upload -> processing -> chat', async () => {
    renderUploadArea();

    expect(hydrateFromBackendMock).toHaveBeenCalledWith('p1');

    fireEvent.click(screen.getByTestId('upload-stage-next'));
    expect(screen.getByTestId('processing-complete')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('processing-complete'));
    expect(screen.getByTestId('plan-approve')).toBeInTheDocument();

    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalled();
    });
  });

  it('restores saved chat stage and navigates to data-viewer on approve', async () => {
    projectState.projects[0].metadata = { uploadStage: 'chat' };

    renderUploadArea();
    expect(screen.getByTestId('plan-approve')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('plan-approve'));

    await waitFor(() => {
      expect(completePhaseMock).toHaveBeenCalledWith('p1', 'upload');
      expect(screen.getByTestId('data-viewer-route')).toBeInTheDocument();
    });
  });

  it('calls async completeChat on plan approval', async () => {
    // Set up an active in-progress chat so completeChat gets called
    planChatStoreState.chats = {
      'active-chat': {
        id: 'active-chat', projectId: 'p1', name: 'Plan 1',
        status: 'in_progress', messages: [], answerHistory: [],
        currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
      },
    };
    getInProgressChatsMock.mockReturnValue([planChatStoreState.chats['active-chat']]);
    projectState.projects[0].metadata = {
      uploadStage: 'chat',
      activePlanChatId: 'active-chat',
    };

    renderUploadArea();

    fireEvent.click(screen.getByTestId('plan-approve'));

    await waitFor(() => {
      expect(completeChatMock).toHaveBeenCalled();
      expect(updateProjectMock).toHaveBeenCalledWith('p1', expect.objectContaining({
        metadata: expect.objectContaining({
          activePlanChatId: undefined,
          uploadStage: 'upload',
        })
      }));
    });
  });

  it('does not restore activePlanChatId when store is not initialized', () => {
    planChatStoreState = { chats: {}, isInitialized: false };
    projectState.projects[0].metadata = {
      uploadStage: 'chat',
      activePlanChatId: 'chat-123',
    };

    renderUploadArea();

    // Should still render the stage (from metadata), but not attempt to access chats
    expect(screen.getByTestId('plan-approve')).toBeInTheDocument();
    // loadFullChat should NOT have been called since store isn't initialized
    expect(loadFullChatMock).not.toHaveBeenCalled();
  });

  it('creates chat asynchronously on ?newPlan=1', async () => {
    createChatMock.mockResolvedValueOnce({
      id: 'server-uuid-1', projectId: 'p1', name: 'Plan 1',
      status: 'in_progress' as const, messages: [], answerHistory: [],
      currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
    });

    renderUploadArea('/project/p1/upload?newPlan=1');

    await waitFor(() => {
      expect(createChatMock).toHaveBeenCalledWith('p1', expect.any(String));
    });

    // Should persist the server-generated chat ID (not a client timestamp ID)
    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalledWith('p1', expect.objectContaining({
        metadata: expect.objectContaining({
          activePlanChatId: 'server-uuid-1',
          uploadStage: 'processing',
        })
      }));
    });
  });

  it('loads full chat on ?chatId=xxx and transitions to chat stage', async () => {
    const mockChat = {
      id: 'chat-abc', projectId: 'p1', name: 'Plan 1',
      status: 'in_progress' as const, messages: [{ id: '1', type: 'user' as const, content: 'hello', timestamp: 1 }],
      answerHistory: [], currentRound: 1, createdAt: Date.now(), updatedAt: Date.now(),
    };
    // Store starts empty — loadFullChat should be called to fetch the chat
    loadFullChatMock.mockImplementationOnce(async () => {
      // Simulate loadFullChat populating the store
      planChatStoreState.chats = { 'chat-abc': mockChat };
      return mockChat;
    });

    renderUploadArea('/project/p1/upload?chatId=chat-abc');

    await waitFor(() => {
      expect(loadFullChatMock).toHaveBeenCalledWith('p1', 'chat-abc');
    });

    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalledWith('p1', expect.objectContaining({
        metadata: expect.objectContaining({
          uploadStage: 'chat',
          activePlanChatId: 'chat-abc',
        })
      }));
    });
  });

  it('does not create duplicate chats when ?newPlan=1 re-renders', async () => {
    // Simulate slow API response
    let resolveCreate!: (v: unknown) => void;
    createChatMock.mockReturnValueOnce(new Promise<unknown>((r) => { resolveCreate = r; }));

    renderUploadArea('/project/p1/upload?newPlan=1');

    // Wait a tick to ensure the effect has fired
    await new Promise((r) => setTimeout(r, 10));

    expect(createChatMock).toHaveBeenCalledTimes(1);

    // Resolve the pending create
    resolveCreate!({
      id: 'chat-1', projectId: 'p1', name: 'Plan 1',
      status: 'in_progress' as const, messages: [], answerHistory: [],
      currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
    });

    await waitFor(() => {
      expect(createChatMock).toHaveBeenCalledTimes(1);
    });
  });
});

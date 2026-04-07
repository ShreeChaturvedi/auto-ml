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
  useDataStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        hydrateFromBackend: hydrateFromBackendMock,
        files: []
      }),
    {
      getState: () => ({
        hydrateFromBackend: hydrateFromBackendMock,
        files: []
      })
    }
  )
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
  UploadStage: ({
    activePlanChatId,
    onPlanApproved,
    onFirstUpload,
  }: {
    projectId: string;
    activePlanChatId: string | null;
    onPlanApproved: (plan: string, name: string) => void;
    onFirstUpload: () => void;
  }) => (
    <div data-testid="upload-stage">
      {activePlanChatId && <span data-testid="active-chat-id">{activePlanChatId}</span>}
      <button type="button" data-testid="plan-approve" onClick={() => onPlanApproved('# Plan', 'bold-falcon-123')}>Approve</button>
      <button type="button" data-testid="first-upload" onClick={onFirstUpload}>First Upload</button>
    </div>
  )
}));

vi.mock('../ProcessingStage', () => ({
  ProcessingStage: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" data-testid="processing-complete" onClick={onComplete}>Processing Complete</button>
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

  it('onFirstUpload enters processing then returns to upload with activePlanChatId set', async () => {
    createChatMock.mockResolvedValueOnce({
      id: 'first-chat', projectId: 'p1', name: 'Plan 1',
      status: 'in_progress' as const, messages: [], answerHistory: [],
      currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
    });

    renderUploadArea();
    expect(screen.getByTestId('upload-stage')).toBeInTheDocument();

    // Trigger first upload
    fireEvent.click(screen.getByTestId('first-upload'));

    await waitFor(() => {
      expect(createChatMock).toHaveBeenCalledWith('p1', expect.any(String));
    });

    // Should enter processing
    await waitFor(() => {
      expect(screen.getByTestId('processing-complete')).toBeInTheDocument();
    });

    // Complete processing → returns to upload
    fireEvent.click(screen.getByTestId('processing-complete'));

    await waitFor(() => {
      expect(screen.getByTestId('upload-stage')).toBeInTheDocument();
    });
  });

  it('?chatId=xxx sets activePlanChatId and stays on upload', async () => {
    const mockChat = {
      id: 'chat-abc', projectId: 'p1', name: 'Plan 1',
      status: 'in_progress' as const, messages: [{ id: '1', type: 'user' as const, content: 'hello', timestamp: 1 }],
      answerHistory: [], currentRound: 1, createdAt: Date.now(), updatedAt: Date.now(),
    };
    loadFullChatMock.mockImplementationOnce(async () => {
      planChatStoreState.chats = { 'chat-abc': mockChat };
      return mockChat;
    });

    renderUploadArea('/project/p1/upload?chatId=chat-abc');

    await waitFor(() => {
      expect(loadFullChatMock).toHaveBeenCalledWith('p1', 'chat-abc');
    });

    // Should stay on upload stage (not transition to chat)
    await waitFor(() => {
      expect(screen.getByTestId('upload-stage')).toBeInTheDocument();
    });

    // Metadata should persist uploadStage as 'upload', not 'chat'
    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalledWith('p1', expect.objectContaining({
        metadata: expect.objectContaining({
          uploadStage: 'upload',
          activePlanChatId: 'chat-abc',
        })
      }));
    });
  });

  it('?newPlan=1 with existing plans creates chat and stays on upload (no animation)', async () => {
    projectState.projects[0].metadata = {
      plans: [{ id: 'plan-1', name: 'Existing Plan', content: '# Plan' }],
    };

    createChatMock.mockResolvedValueOnce({
      id: 'new-chat-2', projectId: 'p1', name: 'Plan 2',
      status: 'in_progress' as const, messages: [], answerHistory: [],
      currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
    });

    renderUploadArea('/project/p1/upload?newPlan=1');

    await waitFor(() => {
      expect(createChatMock).toHaveBeenCalledWith('p1', expect.any(String));
    });

    // Should stay on upload (not enter processing) since plans already exist
    await waitFor(() => {
      expect(screen.getByTestId('upload-stage')).toBeInTheDocument();
    });

    // Should persist uploadStage as 'upload'
    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalledWith('p1', expect.objectContaining({
        metadata: expect.objectContaining({
          uploadStage: 'upload',
          activePlanChatId: 'new-chat-2',
        })
      }));
    });
  });

  it('plan approval clears activePlanChatId and does NOT navigate to data-viewer', async () => {
    planChatStoreState.chats = {
      'active-chat': {
        id: 'active-chat', projectId: 'p1', name: 'Plan 1',
        status: 'in_progress', messages: [], answerHistory: [],
        currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
      },
    };
    projectState.projects[0].metadata = {
      activePlanChatId: 'active-chat',
    };

    renderUploadArea();

    fireEvent.click(screen.getByTestId('plan-approve'));

    await waitFor(() => {
      expect(completeChatMock).toHaveBeenCalled();
      expect(completePhaseMock).toHaveBeenCalledWith('p1', 'upload');
      expect(updateProjectMock).toHaveBeenCalledWith('p1', expect.objectContaining({
        metadata: expect.objectContaining({
          activePlanChatId: null,
          uploadStage: 'upload',
        })
      }));
    });

    // Should NOT navigate to data-viewer
    expect(screen.queryByTestId('data-viewer-route')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-stage')).toBeInTheDocument();
  });

  it('does not re-trigger processing on subsequent uploads', async () => {
    renderUploadArea();

    // First upload triggers processing
    createChatMock.mockResolvedValueOnce({
      id: 'first-chat', projectId: 'p1', name: 'Plan 1',
      status: 'in_progress' as const, messages: [], answerHistory: [],
      currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
    });

    fireEvent.click(screen.getByTestId('first-upload'));

    await waitFor(() => {
      expect(screen.getByTestId('processing-complete')).toBeInTheDocument();
    });

    // Complete processing
    fireEvent.click(screen.getByTestId('processing-complete'));

    await waitFor(() => {
      expect(screen.getByTestId('upload-stage')).toBeInTheDocument();
    });

    // Second "first upload" click should NOT re-trigger processing
    // (the handler uses a `called` flag to prevent re-entry)
    fireEvent.click(screen.getByTestId('first-upload'));

    // Should still be on upload stage
    expect(screen.getByTestId('upload-stage')).toBeInTheDocument();
    expect(screen.queryByTestId('processing-complete')).not.toBeInTheDocument();
  });

  it('does not persist upload metadata on mount when store metadata already matches', async () => {
    renderUploadArea();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(updateProjectMock).not.toHaveBeenCalled();
  });

  it('does not create duplicate chats when ?newPlan=1 re-renders', async () => {
    let resolveCreate!: (v: unknown) => void;
    createChatMock.mockReturnValueOnce(new Promise<unknown>((r) => { resolveCreate = r; }));

    renderUploadArea('/project/p1/upload?newPlan=1');

    await new Promise((r) => setTimeout(r, 10));

    expect(createChatMock).toHaveBeenCalledTimes(1);

    resolveCreate!({
      id: 'chat-1', projectId: 'p1', name: 'Plan 1',
      status: 'in_progress' as const, messages: [], answerHistory: [],
      currentRound: 0, createdAt: Date.now(), updatedAt: Date.now(),
    });

    await waitFor(() => {
      expect(createChatMock).toHaveBeenCalledTimes(1);
    });
  });

  it('does not restore activePlanChatId when store is not initialized', () => {
    planChatStoreState = { chats: {}, isInitialized: false };
    projectState.projects[0].metadata = {
      activePlanChatId: 'chat-123',
    };

    renderUploadArea();

    expect(screen.getByTestId('upload-stage')).toBeInTheDocument();
    expect(loadFullChatMock).not.toHaveBeenCalled();
  });
});

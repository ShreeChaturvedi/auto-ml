import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainingPanel } from '../TrainingPanel';

const mockState = vi.hoisted(() => ({
  // dataStore
  files: [] as Array<{
    id: string;
    name: string;
    type: 'csv';
    size: number;
    uploadedAt: Date;
    projectId: string;
    metadata: { datasetId: string; columns: string[] };
  }>,
  hydrateFromBackendMock: vi.fn(),

  // featureStore
  features: [] as Array<unknown>,
  hydrateFeaturesMock: vi.fn(),

  // notebookStore
  notebooksInStore: [] as Array<{ notebookId: string }>,
  initializeNotebookMock: vi.fn(),
  disconnectNotebookMock: vi.fn(),

  // notebooks API — this is where the isolation invariants get asserted
  listNotebooksMock: vi.fn(),
  createNotebookMock: vi.fn(),
  updateNotebookMock: vi.fn(),
  deleteNotebookMock: vi.fn(),
  notebooksInApi: [] as Array<{ notebookId: string; metadata?: Record<string, unknown>; name?: string }>,

  // modelStore / executionStore
  executeCodeMock: vi.fn(),

  // workbook registry
  setWorkbooksMock: vi.fn()
}));

// Mock AgenticShell so we can observe what notebookId it receives and skip
// its internal notebook initialization dance.
vi.mock('@/components/agentic/AgenticShell', () => ({
  AgenticShell: ({
    notebookId,
    toolbarLeft,
    toolbarRight,
    renderLeftPane
  }: {
    notebookId?: string | null;
    toolbarLeft?: React.ReactNode;
    toolbarRight?: React.ReactNode;
    renderLeftPane?: (props: {
      messages: unknown[];
      isGenerating: boolean;
      error: string | null;
      submitPrompt?: (prompt: string) => void;
      activeTextMessageId?: string | null;
      activeThinkingMessageId?: string | null;
      hydratedMessageIds?: Set<string>;
      onEditMessage?: (id: string) => void;
      onRevertToMessage?: (id: string) => void;
      editingMessageId?: string | null;
      turnDiffs?: Map<string, unknown>;
      onRetryWorkflow?: () => void;
    }) => React.ReactNode;
  }) => (
    <div>
      <div data-testid="training-notebook-id">{notebookId ?? ''}</div>
      <div data-testid="toolbar-left">{toolbarLeft}</div>
      <div data-testid="toolbar-right">{toolbarRight}</div>
      {renderLeftPane
        ? renderLeftPane({
            messages: [],
            isGenerating: false,
            error: null,
            activeTextMessageId: null,
            activeThinkingMessageId: null,
            hydratedMessageIds: new Set<string>(),
            editingMessageId: null,
            turnDiffs: new Map()
          })
        : null}
    </div>
  )
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      files: mockState.files,
      hydrateFromBackend: mockState.hydrateFromBackendMock
    })
}));

vi.mock('@/stores/featureStore', () => ({
  useFeatureStore: (selector: (state: unknown) => unknown) =>
    selector({
      features: mockState.features,
      hydrateFromProject: mockState.hydrateFeaturesMock
    })
}));

vi.mock('@/stores/executionStore', () => ({
  useExecutionStore: Object.assign(
    () => ({ executeCode: mockState.executeCodeMock }),
    { getState: () => ({ executeCode: mockState.executeCodeMock }) }
  )
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        activeNotebookId: null,
        notebooks: mockState.notebooksInStore,
        initializeNotebook: mockState.initializeNotebookMock,
        disconnect: mockState.disconnectNotebookMock
      }),
    {
      getState: () => ({
        activeNotebookId: null,
        notebooks: mockState.notebooksInStore,
        initializeNotebook: mockState.initializeNotebookMock,
        disconnect: mockState.disconnectNotebookMock
      })
    }
  )
}));

vi.mock('@/stores/workbookRegistryStore', () => ({
  useWorkbookRegistryStore: {
    getState: () => ({ setWorkbooks: mockState.setWorkbooksMock })
  }
}));

vi.mock('@/stores/workflowSessionStore', () => ({
  buildWorkflowSessionKey: (a: string, b: string) => `${a}:${b}`,
  useWorkflowSessionStore: Object.assign(
    () => ({ sessions: {}, updateSession: vi.fn(), clearSession: vi.fn() }),
    {
      getState: () => ({ sessions: {}, updateSession: vi.fn(), clearSession: vi.fn() })
    }
  )
}));

vi.mock('@/stores/modelStore', () => ({
  useModelStore: {
    getState: () => ({
      setCurrentStage: vi.fn(),
      updateTrainingRun: vi.fn(),
      clearTrainingRun: vi.fn()
    })
  }
}));

vi.mock('@/lib/api/notebooks', () => ({
  listNotebooks: (...args: unknown[]) => mockState.listNotebooksMock(...args),
  createNotebook: (...args: unknown[]) => mockState.createNotebookMock(...args),
  updateNotebook: (...args: unknown[]) => mockState.updateNotebookMock(...args),
  deleteNotebook: (...args: unknown[]) => mockState.deleteNotebookMock(...args)
}));

vi.mock('@/lib/api/llm', () => ({
  streamWorkflowTurn: vi.fn(async () => undefined)
}));

vi.mock('@/hooks/useWorkflowPlaceholders', () => ({
  useWorkflowPlaceholders: () => []
}));

vi.mock('@/components/agentic/useLifecycleCards', () => ({
  useLifecycleCards: () => () => null
}));

vi.mock('@/components/preprocessing/PreprocessingDialogs', () => ({
  RenameTabDialog: () => null
}));

vi.mock('@/components/preprocessing/preprocessingTabUtils', () => ({
  nextWorkbookName: () => 'Workbook 2',
  createWorkbookId: () => 'training-wb-new'
}));

vi.mock('@/lib/phaseDatasetPersistence', () => ({
  getPreviousPhaseDataset: () => undefined,
  persistPhaseDataset: vi.fn()
}));

vi.mock('@/lib/features/codeGenerator', () => ({
  generateFeatureEngineeringCode: () => '# generated'
}));

// Toolbar/model-card children don't matter for isolation assertions.
vi.mock('../TrainingToolbar', () => ({
  TrainingToolbarLeft: () => null,
  TrainingToolbarRight: () => null
}));
vi.mock('../CodeCell', () => ({
  CodeCell: () => null
}));
vi.mock('../ModelRecommendationCard', () => ({
  ModelRecommendationCard: () => null
}));
vi.mock('@/components/agentic/ChatMessageRenderer', () => ({
  ChatMessageRenderer: () => null
}));

describe('TrainingPanel', () => {
  beforeEach(() => {
    localStorage.clear();

    mockState.files = [{
      id: 'file-1',
      name: 'dataset.csv',
      type: 'csv',
      size: 100,
      uploadedAt: new Date('2026-04-05T00:00:00.000Z'),
      projectId: 'p1',
      metadata: { datasetId: 'ds-1', columns: ['a', 'b'] }
    }];
    mockState.features = [];
    mockState.notebooksInStore = [];
    mockState.notebooksInApi = [];

    mockState.hydrateFromBackendMock.mockReset();
    mockState.hydrateFeaturesMock.mockReset();
    mockState.initializeNotebookMock.mockReset();
    mockState.disconnectNotebookMock.mockReset();
    mockState.executeCodeMock.mockReset();
    mockState.setWorkbooksMock.mockReset();

    mockState.listNotebooksMock.mockReset();
    mockState.listNotebooksMock.mockImplementation(async () => mockState.notebooksInApi);

    mockState.createNotebookMock.mockReset();
    mockState.createNotebookMock.mockImplementation(async (_projectId: string, request: { name: string; metadata?: Record<string, unknown> }) => {
      const created = {
        notebookId: 'new-training-nb',
        name: request.name,
        metadata: request.metadata ?? {}
      };
      mockState.notebooksInApi.push(created);
      return created;
    });

    mockState.updateNotebookMock.mockReset();
    mockState.updateNotebookMock.mockImplementation(async (notebookId: string, request: { metadata?: Record<string, unknown> }) => ({
      notebookId,
      metadata: request.metadata ?? {}
    }));

    mockState.deleteNotebookMock.mockReset();
    mockState.deleteNotebookMock.mockResolvedValue({ success: true });
  });

  const renderPanel = () => render(
    <MemoryRouter initialEntries={['/project/p1/training']}>
      <Routes>
        <Route path="/project/:projectId/training" element={<TrainingPanel />} />
      </Routes>
    </MemoryRouter>
  );

  it('does NOT render the stale "Feature Pipeline Approval Required" gate', async () => {
    // The gate used to block the Training UI when no FE pipeline version had
    // status='approved', but the FE approval flow was removed earlier in
    // sprint10 so drafts can never transition out of 'draft'. Verify the gate
    // is gone for good.
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId('training-notebook-id')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Feature Pipeline Approval Required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Approve a Feature Engineering pipeline/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open Feature Engineering/i })).not.toBeInTheDocument();
  });

  it('creates a training-scoped notebook and does NOT touch the pre-existing FE notebook', async () => {
    // Regression guard for the FE→Training→FE carryover bug.
    //
    // Setup: the project already has an FE notebook from a previous visit to
    // the Feature Engineering tab. It carries its own phase/tabId metadata.
    // When TrainingPanel mounts and useTrainingNotebookSync runs, it MUST:
    //   1. Not adopt the FE notebook.
    //   2. Not call updateNotebook on the FE notebook (which would overwrite
    //      its phase metadata and break useFeatureNotebookSync's ability to
    //      find it next time the user goes back to FE).
    //   3. Create a fresh training notebook with training metadata.
    mockState.notebooksInApi = [
      {
        notebookId: 'fe-draft-notebook',
        name: 'Draft Pipeline v1',
        metadata: {
          phase: 'feature-engineering',
          tabId: 'draft-1',
          tabName: 'Draft Pipeline v1'
        }
      }
    ];

    renderPanel();

    // Wait for the sync hook to resolve and pass the notebookId through.
    await waitFor(() => {
      expect(screen.getByTestId('training-notebook-id')).toHaveTextContent('new-training-nb');
    });

    // Invariant 1: createNotebook was called exactly once, with training metadata.
    expect(mockState.createNotebookMock).toHaveBeenCalledTimes(1);
    expect(mockState.createNotebookMock).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          phase: 'training',
          tabId: expect.any(String)
        })
      })
    );

    // Invariant 2: updateNotebook was NEVER called on the FE notebook.
    const fePatchCalls = mockState.updateNotebookMock.mock.calls.filter(
      ([notebookId]) => notebookId === 'fe-draft-notebook'
    );
    expect(fePatchCalls).toHaveLength(0);

    // Invariant 3: the FE notebook is still in the API's notebook list with
    // its original metadata intact (our createNotebookMock only appends; it
    // never mutates existing entries, but we assert explicitly so a future
    // test scaffold change cannot silently regress).
    const feNotebook = mockState.notebooksInApi.find((n) => n.notebookId === 'fe-draft-notebook');
    expect(feNotebook?.metadata).toEqual({
      phase: 'feature-engineering',
      tabId: 'draft-1',
      tabName: 'Draft Pipeline v1'
    });
  });
});

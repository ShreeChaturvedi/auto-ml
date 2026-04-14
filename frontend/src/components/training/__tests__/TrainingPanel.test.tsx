import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React, { type ReactNode } from 'react';
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
  refreshModelsMock: vi.fn(),

  // workbook registry
  setWorkbooksMock: vi.fn(),

  // agentic shell
  messages: [] as Array<unknown>,
  submitPromptMock: vi.fn(),
  trainingAdapterArgs: [] as Array<Record<string, unknown>>,
  agenticShellMounts: 0,
  agenticShellUnmounts: 0
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
  }) => {
    const instanceIdRef = React.useRef(`training-shell-${Math.random().toString(36).slice(2, 8)}`);
    React.useEffect(() => {
      mockState.agenticShellMounts += 1;
      return () => {
        mockState.agenticShellUnmounts += 1;
      };
    }, []);

    return (
      <div>
        <div data-testid="training-shell-instance">{instanceIdRef.current}</div>
        <div data-testid="training-notebook-id">{notebookId ?? ''}</div>
        <div data-testid="toolbar-left">{toolbarLeft}</div>
        <div data-testid="toolbar-right">{toolbarRight}</div>
        {renderLeftPane
          ? renderLeftPane({
              messages: mockState.messages,
              isGenerating: false,
              error: null,
              submitPrompt: mockState.submitPromptMock,
              activeTextMessageId: null,
              activeThinkingMessageId: null,
              hydratedMessageIds: new Set<string>(),
              editingMessageId: null,
              turnDiffs: new Map()
            })
          : null}
      </div>
    );
  }
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
        currentProjectId: 'p1',
        notebooks: mockState.notebooksInStore,
        initializeNotebook: mockState.initializeNotebookMock,
        disconnect: mockState.disconnectNotebookMock
      }),
    {
      getState: () => ({
        activeNotebookId: null,
        currentProjectId: 'p1',
        notebooks: mockState.notebooksInStore,
        initializeNotebook: mockState.initializeNotebookMock,
        disconnect: mockState.disconnectNotebookMock
      })
    }
  )
}));

vi.mock('@/stores/workbookRegistryStore', () => ({
  useWorkbookRegistryStore: {
    getState: () => ({
      setWorkbooks: mockState.setWorkbooksMock,
      setActiveWorkbookId: vi.fn()
    })
  }
}));

vi.mock('@/stores/workflowSessionStore', () => ({
  buildWorkflowSessionKey: (a: string, b: string) => `${a}:${b}`,
  useWorkflowSessionStore: Object.assign(
    () => ({
      sessions: {},
      getSession: vi.fn(),
      updateSession: vi.fn(),
      clearSession: vi.fn()
    }),
    {
      getState: () => ({
        sessions: {},
        getSession: vi.fn(),
        updateSession: vi.fn(),
        clearSession: vi.fn()
      })
    }
  )
}));

vi.mock('@/stores/modelStore', () => ({
  useModelStore: {
    getState: () => ({
      refreshModels: mockState.refreshModelsMock,
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

vi.mock('@/components/agentic/useLifecycleCards', async () => {
  const actual = await vi.importActual<typeof import('@/components/agentic/useLifecycleCards')>(
    '@/components/agentic/useLifecycleCards'
  );
  return {
    useLifecycleCards: actual.useLifecycleCards
  };
});

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

vi.mock('../TrainingAdapter', () => ({
  createTrainingAdapter: (args: Record<string, unknown>) => {
    mockState.trainingAdapterArgs.push(args);
    return {};
  }
}));

// Toolbar/model-card children don't matter for isolation assertions.
vi.mock('../TrainingToolbar', () => ({
  TrainingToolbarLeft: ({
    onReset,
    onSwitch
  }: {
    onReset: () => void;
    onSwitch: (workbookId: string) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => {
          mockState.messages = [];
          onReset();
        }}
      >
        Reset workbook
      </button>
      <button type="button" onClick={() => onSwitch('training-wb-2')}>
        Switch workbook
      </button>
    </div>
  ),
  TrainingToolbarRight: () => null
}));
vi.mock('../CodeCell', () => ({
  CodeCell: () => null
}));
vi.mock('../ModelRecommendationCard', () => ({
  ModelRecommendationCard: () => null
}));
vi.mock('@/components/agentic/ChatMessageRenderer', () => ({
  ChatMessageRenderer: ({
    messages,
    renderLifecycleCard
  }: {
    messages: Array<unknown>;
    renderLifecycleCard?: (message: never) => ReactNode;
  }) => (
    <div>
      {messages.map((message, index) => (
        <div key={index}>{renderLifecycleCard?.(message as never)}</div>
      ))}
    </div>
  )
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
    mockState.refreshModelsMock.mockReset();
    mockState.refreshModelsMock.mockResolvedValue(undefined);
    mockState.setWorkbooksMock.mockReset();
    mockState.submitPromptMock.mockReset();
    mockState.messages = [];
    mockState.trainingAdapterArgs = [];
    mockState.agenticShellMounts = 0;
    mockState.agenticShellUnmounts = 0;

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

  const renderPanel = (initialPath = '/project/p1/training') => render(
    <MemoryRouter initialEntries={[initialPath]}>
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

  it('preloads models for the active project so Experiments can reopen warm', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockState.refreshModelsMock).toHaveBeenCalledWith('p1');
    });
  });

  it('uses a no-target training workflow session key until the user selects a target', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockState.trainingAdapterArgs.length).toBeGreaterThan(0);
    });

    const lastArgs = mockState.trainingAdapterArgs.at(-1);
    expect(lastArgs?.sessionKey).toContain(':ds-1:no-target');
    expect(lastArgs?.targetColumn).toBeUndefined();
  });

  it('respects the workbook query param on first Training render', async () => {
    localStorage.setItem('training-workbooks-v1-p1', JSON.stringify({
      activeWorkbookId: 'training-wb-1',
      workbooks: [
        { id: 'training-wb-1', name: 'Workbook 1', notebookId: null },
        { id: 'training-wb-2', name: 'Workbook 2', notebookId: null }
      ]
    }));

    renderPanel('/project/p1/training?workbook=training-wb-2');

    await waitFor(() => {
      expect(mockState.createNotebookMock).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          name: 'Workbook 2',
          metadata: expect.objectContaining({
            phase: 'training',
            tabId: 'training-wb-2',
            tabName: 'Workbook 2'
          })
        })
      );
    });
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

  it('replaces the stale apply strip with an approval card and clears it on reset', async () => {
    mockState.messages = [
      {
        id: 'proposal-message-1',
        type: 'tool_call',
        call: {
          id: 'proposal-call-1',
          tool: 'propose_training_plan',
          args: { modelName: 'Random Forest' }
        },
        result: {
          id: 'proposal-call-1',
          tool: 'propose_training_plan',
          output: { status: 'awaiting_approval' }
        }
      },
      {
        id: 'proposal-message-2',
        type: 'tool_call',
        call: {
          id: 'proposal-call-2',
          tool: 'propose_training_plan',
          args: { modelName: 'XGBoost' }
        },
        result: {
          id: 'proposal-call-2',
          tool: 'propose_training_plan',
          output: { status: 'awaiting_approval' }
        }
      }
    ];

    renderPanel();

    const applyButton = await screen.findByRole('button', { name: /Train Selected Model/i });
    expect(screen.getByText(/1 of 2 models selected/i)).toBeInTheDocument();
    expect(screen.getByText(/Only 1 model can be trained at a time/i)).toBeInTheDocument();

    fireEvent.click(applyButton);

    expect(mockState.submitPromptMock).toHaveBeenCalledWith(
      'Approved. Proceed with training the selected model: Random Forest.'
    );
    expect(await screen.findByRole('button', { name: /Applied/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Reset workbook/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Applied/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/1 of 2 models selected/i)).not.toBeInTheDocument();
  });

  it('hides the approval gate when pending proposal messages are stale and later training tools already ran', async () => {
    mockState.messages = [
      {
        id: 'proposal-message-1',
        type: 'tool_call',
        call: {
          id: 'proposal-call-1',
          tool: 'propose_training_plan',
          args: { modelName: 'Logistic Regression' }
        },
        result: {
          id: 'proposal-call-1',
          tool: 'propose_training_plan',
          output: { status: 'awaiting_approval' }
        }
      },
      {
        id: 'register-message-1',
        type: 'tool_call',
        call: {
          id: 'register-call-1',
          tool: 'register_model',
          args: { modelName: 'Logistic Regression' }
        },
        result: {
          id: 'register-call-1',
          tool: 'register_model',
          output: {
            status: 'registered',
            modelId: 'model-1',
            metrics: { accuracy: 0.9 }
          }
        }
      }
    ];

    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId('training-notebook-id')).toHaveTextContent('new-training-nb');
    });

    expect(screen.queryByText(/Approve Model Training/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Train Selected Model/i })).not.toBeInTheDocument();
  });

  it('does not remount AgenticShell when switching training workbooks', async () => {
    renderPanel();

    let initialInstanceId = '';
    await waitFor(() => {
      expect(mockState.agenticShellMounts).toBe(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('training-notebook-id')).toHaveTextContent('new-training-nb');
    });
    initialInstanceId = screen.getByTestId('training-shell-instance').textContent ?? '';

    fireEvent.click(screen.getByRole('button', { name: /Switch workbook/i }));

    await waitFor(() => {
      expect(screen.getByTestId('training-shell-instance')).toHaveTextContent(initialInstanceId);
    });
  });
});

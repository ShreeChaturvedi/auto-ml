import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureEngineeringPanel } from '../FeatureEngineeringPanel';
import { TooltipProvider } from '@/components/ui/tooltip';

const mockState = vi.hoisted(() => ({
  files: [] as Array<{
    id: string;
    name: string;
    type: 'csv' | 'excel';
    size: number;
    uploadedAt: Date;
    projectId: string;
    metadata: {
      datasetId: string;
      columns: string[];
    };
  }>,
  features: [] as Array<unknown>,
  versions: {} as Record<string, Array<{
    id: string;
    projectId: string;
    name: string;
    status: 'draft' | 'approved' | 'deprecated';
    createdAt: string;
    readinessReport: {
      dataSummary: {
        addedColumns: string[];
        removedColumns: string[];
        renamedColumns: Array<{ oldName: string; newName: string }>;
        typeChanges: Array<{ column: string; oldType: string; newType: string }>;
        nullDeltas: Array<{ column: string; oldNullCount: number; newNullCount: number }>;
        warnings: string[];
      };
      steps: Array<{
        id: string;
        name: string;
        rationale: string;
        method?: string;
        columns?: string[];
        codeReference?: string;
      }>;
    };
  }>>,
  currentVersionId: {} as Record<string, string>,
  hydrateFromBackendMock: vi.fn(),
  upsertFeatureMock: vi.fn(),
  removeFeatureMock: vi.fn(),
  clearProjectFeaturesMock: vi.fn(),
  hydrateFeaturesMock: vi.fn(),
  createDraftVersionMock: vi.fn(),
  removeVersionMock: vi.fn(),
  renameVersionMock: vi.fn(),
  approveVersionMock: vi.fn(),
  setCurrentVersionMock: vi.fn(),
  setVersionNotebookIdMock: vi.fn(),
  updateReadinessReportMock: vi.fn(),
  initializeNotebookMock: vi.fn(),
  loadNotebooksMock: vi.fn(),
  createNotebookMock: vi.fn(),
  setActiveNotebookMock: vi.fn(),
  disconnectNotebookMock: vi.fn(),
  activeNotebookId: null as string | null,
  currentProjectId: 'p1',
  notebooks: [] as Array<{ notebookId: string }>,
  updateNotebookMetadataMock: vi.fn(),
  notebookCells: [] as Array<{
    cellId: string;
    notebookId: string;
    cellType: 'code' | 'markdown';
    title?: string | null;
    content: string;
    position: number;
    metadata: Record<string, unknown>;
    executionCount: number;
    executionStatus: 'idle' | 'running' | 'success' | 'error';
    createdAt: string;
    updatedAt: string;
  }>,
  createNotebookCellMock: vi.fn(),
  updateNotebookCellMock: vi.fn(),
  applyFeatureEngineeringMock: vi.fn(),
  createNotebookApiMock: vi.fn(),
  updateNotebookApiMock: vi.fn(),
  submitPromptMock: vi.fn(),
  messages: [] as unknown[],
  featureSteps: {} as Record<string, { status: string }>,
  currentStage: null as string | null,
  latestAdapterConfig: null as Record<string, unknown> | null,
  latestBeforeSubmit: null as ((prompt: string) => Promise<string | null>) | null
}));

vi.mock('@/components/agentic/AgenticShell', () => ({
  AgenticShell: ({
    LeftPaneComponent,
    renderLeftPane,
    toolbarLeft,
    toolbarRight,
    chatMetaSlot,
    domainLockReason,
    notebookId,
    beforeSubmit
  }: {
    LeftPaneComponent?: React.ComponentType<{ messages: unknown[]; isGenerating: boolean; error: string | null; submitPrompt?: (prompt: string) => void }>;
    renderLeftPane?: (props: { messages: unknown[]; isGenerating: boolean; error: string | null; submitPrompt?: (prompt: string) => void }) => React.ReactNode;
    toolbarLeft?: React.ReactNode;
    toolbarRight?: React.ReactNode;
    chatMetaSlot?: React.ReactNode;
    domainLockReason?: string;
    notebookId?: string | null;
    beforeSubmit?: (prompt: string) => Promise<string | null>;
  }) => (
    <div>
      <div data-testid="has-before-submit">{beforeSubmit ? 'yes' : 'no'}</div>
      <div data-testid="toolbar-left">{toolbarLeft}</div>
      <div data-testid="toolbar-right">{toolbarRight}</div>
      <div data-testid="chat-meta">{chatMetaSlot}</div>
      <div data-testid="notebook-id">{notebookId ?? ''}</div>
      {domainLockReason ? <div data-testid="domain-lock">{domainLockReason}</div> : null}
      {renderLeftPane
        ? renderLeftPane({ messages: mockState.messages, isGenerating: false, error: null, submitPrompt: mockState.submitPromptMock })
        : LeftPaneComponent
          ? <LeftPaneComponent messages={mockState.messages} isGenerating={false} error={null} submitPrompt={mockState.submitPromptMock} />
          : null}
    </div>
  )
}));

vi.mock('../FeatureEngineeringAdapter', () => ({
  createFeatureEngineeringAdapter: (config: Record<string, unknown>) => {
    mockState.latestAdapterConfig = config;
    return {
      buildRequest: vi.fn(),
      onWorkflowStateUpdate: vi.fn(),
      onWorkflowArtifactUpdate: vi.fn(),
      onRevert: vi.fn(),
      preserveToolHistoryBetweenPrompts: true,
      toolRegistry: {},
      toolUiRegistry: {}
    };
  }
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      files: mockState.files,
      hydrateFromBackend: mockState.hydrateFromBackendMock
    })
}));

vi.mock('@/stores/featureStore', () => {
  const createFeatureStoreState = () => ({
      features: mockState.features,
      upsertFeature: mockState.upsertFeatureMock,
      removeFeature: mockState.removeFeatureMock,
      clearProjectFeatures: mockState.clearProjectFeaturesMock,
      hydrateFromProject: mockState.hydrateFeaturesMock,
      versions: mockState.versions,
      currentVersionId: mockState.currentVersionId,
      createDraftVersion: mockState.createDraftVersionMock,
      removeVersion: mockState.removeVersionMock,
      renameVersion: mockState.renameVersionMock,
      approveVersion: mockState.approveVersionMock,
      setCurrentVersion: mockState.setCurrentVersionMock,
      setVersionNotebookId: mockState.setVersionNotebookIdMock,
      updateReadinessReport: mockState.updateReadinessReportMock,
      featureSteps: mockState.featureSteps,
      currentStage: mockState.currentStage,
      featureRunId: null,
      setFeatureStep: vi.fn(),
      setCurrentStage: vi.fn(),
      setFeatureRunId: vi.fn(),
      clearDraft: vi.fn()
    });

  const useFeatureStore = Object.assign(
    (selector: (state: unknown) => unknown) => selector(createFeatureStoreState()),
    {
      getState: createFeatureStoreState
    }
  );
  return { useFeatureStore };
});

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: (selector: (state: unknown) => unknown) =>
    selector({
      initializeNotebook: mockState.initializeNotebookMock,
      loadNotebooks: mockState.loadNotebooksMock,
      createNotebook: mockState.createNotebookMock,
      setActiveNotebook: mockState.setActiveNotebookMock,
      disconnect: mockState.disconnectNotebookMock,
      activeNotebookId: mockState.activeNotebookId,
      currentProjectId: mockState.currentProjectId,
      notebooks: mockState.notebooks,
      updateNotebookMetadata: mockState.updateNotebookMetadataMock,
      cells: mockState.notebookCells,
      createCell: mockState.createNotebookCellMock,
      updateCell: mockState.updateNotebookCellMock
    })
}));

vi.mock('@/lib/api/notebooks', () => ({
  createNotebook: (...args: unknown[]) => mockState.createNotebookApiMock(...args),
  updateNotebook: (...args: unknown[]) => mockState.updateNotebookApiMock(...args)
}));

vi.mock('@/stores/nlSuggestionStore', () => ({
  useNlSuggestionStore: (selector: (state: unknown) => unknown) =>
    selector({
      byProject: {},
      fetchProjectSuggestions: vi.fn().mockResolvedValue(null),
      reset: vi.fn()
    })
}));

vi.mock('@/lib/api/featureEngineering', () => ({
  applyFeatureEngineering: (...args: unknown[]) => mockState.applyFeatureEngineeringMock(...args),
  fetchFeatureRuns: vi.fn().mockResolvedValue({ runs: [], count: 0, projectId: '' }),
  fetchFeatureRun: vi.fn().mockResolvedValue({ run: { runId: '', projectId: '', features: {}, createdAt: '', updatedAt: '' } })
}));

vi.mock('../hooks/useFeatureNotebookSync', () => ({
  useFeatureNotebookSync: () => ({
    notebookId: 'fe-notebook-1',
    isReady: true
  })
}));

describe('FeatureEngineeringPanel (Issue #44)', () => {
  beforeEach(() => {
    mockState.files = [{
      id: 'dataset-1',
      name: 'employees.csv',
      type: 'csv',
      size: 512,
      uploadedAt: new Date('2026-02-24T00:00:00.000Z'),
      projectId: 'p1',
      metadata: {
        datasetId: 'dataset-1',
        columns: ['First Name', 'Last Name', 'Salary']
      }
    }];

    mockState.features = [];

    mockState.versions = {
      p1: [
        {
          id: 'v1',
          projectId: 'p1',
          name: 'Draft Pipeline v1',
          status: 'draft',
          createdAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
          readinessReport: {
            dataSummary: {
              addedColumns: [],
              removedColumns: [],
              renamedColumns: [],
              typeChanges: [],
              nullDeltas: [],
              warnings: []
            },
            steps: []
          }
        }
      ]
    };

    mockState.currentVersionId = { p1: 'v1' };

    mockState.hydrateFromBackendMock.mockReset();
    mockState.upsertFeatureMock.mockReset();
    mockState.removeFeatureMock.mockReset();
    mockState.clearProjectFeaturesMock.mockReset();
    mockState.hydrateFeaturesMock.mockReset();
    mockState.createDraftVersionMock.mockReset();
    mockState.removeVersionMock.mockReset();
    mockState.renameVersionMock.mockReset();
    mockState.approveVersionMock.mockReset();
    mockState.setCurrentVersionMock.mockReset();
    mockState.setVersionNotebookIdMock.mockReset();
    mockState.updateReadinessReportMock.mockReset();
    mockState.initializeNotebookMock.mockReset();
    mockState.loadNotebooksMock.mockReset();
    mockState.createNotebookMock.mockReset();
    mockState.setActiveNotebookMock.mockReset();
    mockState.disconnectNotebookMock.mockReset();
    mockState.activeNotebookId = null;
    mockState.currentProjectId = 'p1';
    mockState.notebooks = [];
    mockState.createNotebookMock.mockResolvedValue({ notebookId: 'fe-notebook-1' });
    mockState.updateNotebookMetadataMock.mockReset();
    mockState.notebookCells = [];
    mockState.createNotebookCellMock.mockReset();
    mockState.updateNotebookCellMock.mockReset();
    mockState.applyFeatureEngineeringMock.mockReset();
    mockState.createNotebookApiMock.mockReset();
    mockState.updateNotebookApiMock.mockReset();
    mockState.submitPromptMock.mockReset();
    mockState.messages = [];
    mockState.featureSteps = {};
    mockState.currentStage = null;
    mockState.latestAdapterConfig = null;
    mockState.latestBeforeSubmit = null;
    mockState.createNotebookApiMock.mockResolvedValue({
      notebookId: 'fe-notebook-1',
      projectId: 'p1',
      name: 'Draft Pipeline v1',
      metadata: {
        phase: 'feature-engineering',
        tabId: 'v1',
        tabName: 'Draft Pipeline v1'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    mockState.updateNotebookApiMock.mockResolvedValue({
      notebookId: 'fe-notebook-1',
      projectId: 'p1',
      name: 'Draft Pipeline v1',
      metadata: {
        phase: 'feature-engineering',
        tabId: 'v1',
        tabName: 'Draft Pipeline v1'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  const renderPanel = (initialEntries = ['/']) => render(
    <TooltipProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="*" element={<FeatureEngineeringPanel projectId="p1" />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>
  );

  it('renders the FE build card and keeps notebook generation disabled with no active features', () => {
    renderPanel();

    expect(screen.getByText('Choose Features To Build')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Notebook Steps/i })).toBeDisabled();
  });

  it('passes the draft-scoped notebook id into the agent shell', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId('notebook-id')).toHaveTextContent('fe-notebook-1');
    });
  });

  it('uses a dataset and target scoped FE session key and wires a prompt preprocessor', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockState.latestAdapterConfig).toMatchObject({
        datasetId: 'dataset-1',
        targetColumn: undefined,
        sessionKey: 'p1:feature-engineering-messages-v3-v1:dataset-1:no-target'
      });
      expect(screen.getByTestId('has-before-submit')).toHaveTextContent('yes');
    });
  });

  it('submits an implementation prompt from the FE status card when features are enabled', async () => {
    mockState.features = [
      {
        id: 'f1',
        projectId: 'p1',
        sourceColumn: 'Salary',
        featureName: 'Salary_Scaled',
        method: 'standardize',
        category: 'scaling',
        enabled: true,
        createdAt: new Date().toISOString(),
        params: {}
      }
    ];

    renderPanel();

    const implementButton = screen.getByRole('button', { name: /Generate Notebook Steps/i });
    expect(implementButton).toBeEnabled();
    fireEvent.click(implementButton);

    await waitFor(() => {
      expect(mockState.submitPromptMock).toHaveBeenCalledWith(
        'Implement the enabled feature in the notebook for this draft, run the cells, validate the result, and register it.'
      );
    });
  });

  it('does not lock the FE shell for approved versions', async () => {
    mockState.versions.p1[0].status = 'approved';
    mockState.features = [
      {
        id: 'f1',
        projectId: 'p1',
        sourceColumn: 'Salary',
        featureName: 'Salary_Scaled',
        method: 'standardize',
        category: 'scaling',
        enabled: true,
        createdAt: new Date().toISOString(),
        params: {}
      }
    ];

    renderPanel();

    expect(screen.queryByTestId('domain-lock')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate Notebook Steps/i })).toBeEnabled();
  });

  it('keeps the build gate styling stable between empty and enabled feature states', () => {
    const firstRender = renderPanel();

    const emptyStateCard = screen.getByText('Choose Features To Build').closest('.border-muted.bg-muted\\/30');
    expect(emptyStateCard).not.toBeNull();
    expect(emptyStateCard?.className).not.toContain('border-sky');
    firstRender.unmount();

    mockState.features = [
      {
        id: 'f1',
        projectId: 'p1',
        sourceColumn: 'Salary',
        featureName: 'Salary_Scaled',
        method: 'standardize',
        category: 'scaling',
        enabled: true,
        createdAt: new Date().toISOString(),
        params: {}
      }
    ];

    renderPanel();
    const enabledStateCard = screen.getByText('Build Enabled Features').closest('.border-muted.bg-muted\\/30');
    expect(enabledStateCard).not.toBeNull();
    expect(enabledStateCard?.className).not.toContain('border-sky');
  });

  it('does not duplicate propose_feature cards when feature suggestion UI is present', () => {
    mockState.messages = [
      {
        id: 'tool-1',
        type: 'tool_call',
        call: {
          id: 'call-1',
          tool: 'propose_feature',
          args: { featureName: 'salary_bucket' },
          rationale: 'Buckets can capture nonlinear pay effects.'
        },
        result: {
          id: 'call-1',
          tool: 'propose_feature',
          output: {
            status: 'proposed',
            featureId: 'feat-salary-bucket',
            featureName: 'salary_bucket'
          }
        }
      },
      {
        id: 'ui-1',
        type: 'ui',
        schema: {
          version: '1',
          kind: 'feature_engineering',
          sections: [{
            id: 'suggestions',
            title: 'Feature Proposals',
            items: [{
              type: 'feature_suggestion',
              id: 'feat-salary-bucket',
              feature: {
                sourceColumn: 'Salary',
                featureName: 'salary_bucket',
                method: 'bucketize',
                params: {}
              },
              rationale: 'Buckets can capture nonlinear pay effects.',
              impact: 'medium'
            }]
          }]
        }
      }
    ];

    renderPanel();

    expect(screen.getByText('salary_bucket')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    expect(screen.queryByText('Proposed')).not.toBeInTheDocument();

    expect(screen.queryByText('Buckets can capture nonlinear pay effects.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /What this feature does/i }));
    expect(screen.getByText('Buckets can capture nonlinear pay effects.')).toBeInTheDocument();
  });

  it('ignores corrupted persisted UI items instead of crashing the phase', () => {
    mockState.messages = [
      {
        id: 'ui-corrupted',
        type: 'ui',
        schema: {
          version: '1',
          kind: 'feature_engineering',
          sections: [{
            id: 'suggestions',
            title: 'Feature Proposals',
            items: ['[truncated]']
          }]
        }
      }
    ];

    expect(() => renderPanel()).not.toThrow();
    expect(screen.getByText('Feature Proposals')).toBeInTheDocument();
  });

  it('suppresses duplicate FE semantic cards when notebook write and run cards already show the work', () => {
    mockState.messages = [
      { id: 'user-1', type: 'user', content: 'Implement enabled features', timestamp: Date.now() },
      {
        id: 'materialize-1',
        type: 'tool_call',
        call: {
          id: 'materialize-1',
          tool: 'materialize_feature_code',
          args: {
            featureId: 'feat-1',
            code: 'df["event_month"] = pd.to_datetime(df["event_date"]).dt.month'
          }
        },
        result: {
          id: 'materialize-1',
          tool: 'materialize_feature_code',
          output: { status: 'ok', featureId: 'feat-1' }
        }
      },
      {
        id: 'write-1',
        type: 'tool_call',
        call: {
          id: 'write-1',
          tool: 'write_cell',
          args: {
            content: 'df["event_month"] = pd.to_datetime(df["event_date"]).dt.month',
            metadata: { phase: 'feature-engineering', featureId: 'feat-1' }
          }
        },
        result: {
          id: 'write-1',
          tool: 'write_cell',
          output: { cellId: 'cell-1' }
        }
      },
      {
        id: 'run-1',
        type: 'tool_call',
        call: {
          id: 'run-1',
          tool: 'run_cell',
          args: {
            cellId: 'cell-1',
            metadata: { phase: 'feature-engineering', featureId: 'feat-1' }
          }
        },
        result: {
          id: 'run-1',
          tool: 'run_cell',
          output: { status: 'success', executionMs: 62 }
        }
      },
      {
        id: 'execute-1',
        type: 'tool_call',
        call: {
          id: 'execute-1',
          tool: 'execute_feature',
          args: {
            cellId: 'cell-1',
            featureId: 'feat-1',
            succeeded: true,
            executionSource: 'notebook'
          }
        },
        result: {
          id: 'execute-1',
          tool: 'execute_feature',
          output: { status: 'ok', featureId: 'feat-1', succeeded: true, executionMs: 62 }
        }
      },
      {
        id: 'validate-1',
        type: 'tool_call',
        call: { id: 'validate-1', tool: 'validate_feature', args: { featureId: 'feat-1' } },
        result: {
          id: 'validate-1',
          tool: 'validate_feature',
          output: { status: 'ok', featureId: 'feat-1' }
        }
      },
      {
        id: 'register-1',
        type: 'tool_call',
        call: { id: 'register-1', tool: 'register_feature', args: { featureId: 'feat-1' } },
        result: {
          id: 'register-1',
          tool: 'register_feature',
          output: { status: 'ok', featureId: 'feat-1' }
        }
      }
    ];

    renderPanel();

    expect(screen.getAllByText('Generated code')).toHaveLength(1);
    expect(screen.getAllByText('Execution succeeded')).toHaveLength(1);
    expect(screen.getByText('Validation passed')).toBeInTheDocument();
    expect(screen.getByText('Committed')).toBeInTheDocument();
  });

  it('renders exact duplicate tool call ids only once after old persisted runs are rehydrated', () => {
    const duplicateRegister = {
      id: 'register-1',
      type: 'tool_call' as const,
      call: { id: 'register-1', tool: 'register_feature', args: { featureId: 'feat-1' } },
      result: {
        id: 'register-1',
        tool: 'register_feature',
        output: { status: 'ok', featureId: 'feat-1' }
      }
    };
    mockState.messages = [
      { id: 'user-1', type: 'user', content: 'Implement enabled features', timestamp: Date.now() },
      duplicateRegister,
      { ...duplicateRegister, id: 'register-1-copy' }
    ];

    renderPanel();

    expect(screen.getAllByText('Committed')).toHaveLength(1);
  });

  it('keeps FE semantic error cards visible even when notebook cards exist', () => {
    mockState.messages = [
      { id: 'user-1', type: 'user', content: 'Implement enabled features', timestamp: Date.now() },
      {
        id: 'write-1',
        type: 'tool_call',
        call: {
          id: 'write-1',
          tool: 'write_cell',
          args: {
            content: 'df["event_month"] = pd.to_datetime(df["event_date"]).dt.month',
            metadata: { phase: 'feature-engineering', featureId: 'feat-1' }
          }
        },
        result: {
          id: 'write-1',
          tool: 'write_cell',
          output: { cellId: 'cell-1' }
        }
      },
      {
        id: 'execute-1',
        type: 'tool_call',
        call: {
          id: 'execute-1',
          tool: 'execute_feature',
          args: {
            cellId: 'cell-1',
            featureId: 'feat-1',
            succeeded: false,
            executionSource: 'notebook'
          }
        },
        result: {
          id: 'execute-1',
          tool: 'execute_feature',
          error: 'Feature execution failed after notebook run.'
        }
      }
    ];

    renderPanel();

    expect(screen.getByText('Generated code')).toBeInTheDocument();
    expect(screen.getByText('Feature execution failed after notebook run.')).toBeInTheDocument();
  });

  it('defaults output format to xlsx for excel datasets', async () => {
    mockState.files = [{
      id: 'dataset-1',
      name: 'employees.xlsx',
      type: 'excel',
      size: 512,
      uploadedAt: new Date('2026-02-24T00:00:00.000Z'),
      projectId: 'p1',
      metadata: {
        datasetId: 'dataset-1',
        columns: ['First Name', 'Last Name', 'Salary']
      }
    }];

    renderPanel();

    const formatLabel = screen.getByText('Format');
    const formatContainer = formatLabel.closest('div');
    expect(formatContainer).not.toBeNull();

    const formatTrigger = within(formatContainer as HTMLElement).getByRole('combobox');

    await waitFor(() => {
      expect(formatTrigger).toHaveTextContent(/xlsx/i);
    });
  });

  it('switches the active draft when the workbook query param changes after mount', async () => {
    mockState.versions = {
      p1: [
        {
          id: 'v1',
          projectId: 'p1',
          name: 'Draft Pipeline v1',
          status: 'draft',
          createdAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
          readinessReport: {
            dataSummary: {
              addedColumns: [],
              removedColumns: [],
              renamedColumns: [],
              typeChanges: [],
              nullDeltas: [],
              warnings: []
            },
            steps: []
          }
        },
        {
          id: 'v2',
          projectId: 'p1',
          name: 'New Draft Pipeline',
          status: 'draft',
          createdAt: new Date('2026-02-24T01:00:00.000Z').toISOString(),
          readinessReport: {
            dataSummary: {
              addedColumns: [],
              removedColumns: [],
              renamedColumns: [],
              typeChanges: [],
              nullDeltas: [],
              warnings: []
            },
            steps: []
          }
        }
      ]
    };
    mockState.currentVersionId = { p1: 'v1' };

    function NavigateToV2Button() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/project/p1/feature-engineering?workbook=v2')}>
          go-v2
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/project/p1/feature-engineering?workbook=v1']}>
        <Routes>
          <Route
            path="/project/:projectId/feature-engineering"
            element={(
              <>
                <NavigateToV2Button />
                <FeatureEngineeringPanel projectId="p1" />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>
    );

    mockState.setCurrentVersionMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'go-v2' }));

    await waitFor(() => {
      expect(mockState.setCurrentVersionMock).toHaveBeenCalledWith('p1', 'v2');
    });
  });

  it('writes the active draft pipeline into the workbook query param', async () => {
    function LocationProbe() {
      const location = useLocation();
      return <div data-testid="location-search">{location.search}</div>;
    }

    render(
      <MemoryRouter initialEntries={['/project/p1/feature-engineering']}>
        <Routes>
          <Route
            path="/project/:projectId/feature-engineering"
            element={(
              <>
                <LocationProbe />
                <FeatureEngineeringPanel projectId="p1" />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('workbook=v1');
    });
  });
});

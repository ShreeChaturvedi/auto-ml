import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureEngineeringPanel } from '../FeatureEngineeringPanel';

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
  updateReadinessReportMock: vi.fn(),
  initializeNotebookMock: vi.fn(),
  disconnectNotebookMock: vi.fn(),
  notebookCells: [] as Array<{
    cellId: string;
    notebookId: string;
    cellType: 'code' | 'markdown';
    title?: string | null;
    content: string;
    position: number;
    executionCount: number;
    executionStatus: 'idle' | 'running' | 'success' | 'error';
    createdAt: string;
    updatedAt: string;
  }>,
  createNotebookCellMock: vi.fn(),
  updateNotebookCellMock: vi.fn(),
  applyFeatureEngineeringMock: vi.fn()
}));

vi.mock('@/components/agentic/AgenticShell', () => ({
  AgenticShell: ({
    LeftPaneComponent,
    renderLeftPane,
    toolbarLeft,
    toolbarRight,
    chatMetaSlot,
    domainLockReason
  }: {
    LeftPaneComponent?: React.ComponentType<{ messages: unknown[]; isGenerating: boolean; error: string | null }>;
    renderLeftPane?: (props: { messages: unknown[]; isGenerating: boolean; error: string | null }) => React.ReactNode;
    toolbarLeft?: React.ReactNode;
    toolbarRight?: React.ReactNode;
    chatMetaSlot?: React.ReactNode;
    domainLockReason?: string;
  }) => (
    <div>
      <div data-testid="toolbar-left">{toolbarLeft}</div>
      <div data-testid="toolbar-right">{toolbarRight}</div>
      <div data-testid="chat-meta">{chatMetaSlot}</div>
      {domainLockReason ? <div data-testid="domain-lock">{domainLockReason}</div> : null}
      {renderLeftPane
        ? renderLeftPane({ messages: [], isGenerating: false, error: null })
        : LeftPaneComponent
          ? <LeftPaneComponent messages={[]} isGenerating={false} error={null} />
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
      updateReadinessReport: mockState.updateReadinessReportMock
    })
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: (selector: (state: unknown) => unknown) =>
    selector({
      initializeNotebook: mockState.initializeNotebookMock,
      disconnect: mockState.disconnectNotebookMock,
      cells: mockState.notebookCells,
      createCell: mockState.createNotebookCellMock,
      updateCell: mockState.updateNotebookCellMock
    })
}));

vi.mock('@/lib/api/featureEngineering', () => ({
  applyFeatureEngineering: (...args: unknown[]) => mockState.applyFeatureEngineeringMock(...args)
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
    mockState.updateReadinessReportMock.mockReset();
    mockState.initializeNotebookMock.mockReset();
    mockState.disconnectNotebookMock.mockReset();
    mockState.notebookCells = [];
    mockState.createNotebookCellMock.mockReset();
    mockState.updateNotebookCellMock.mockReset();
    mockState.applyFeatureEngineeringMock.mockReset();
  });

  it('renders agentic shell layout and keeps approval gated with no active features', () => {
    render(<FeatureEngineeringPanel projectId="p1" />);

    expect(screen.getByText('Approval Gate: Readiness Review')).toBeInTheDocument();

    const approveButton = screen.getByRole('button', { name: /Approve Pipeline/i });
    expect(approveButton).toBeDisabled();
  });

  it('enables approval when readiness evidence exists and calls approve action', async () => {
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

    mockState.versions.p1[0].readinessReport = {
      dataSummary: {
        addedColumns: ['Salary_Scaled'],
        removedColumns: [],
        renamedColumns: [],
        typeChanges: [],
        nullDeltas: [],
        warnings: []
      },
      steps: [
        {
          id: 'f1',
          name: 'Salary_Scaled',
          rationale: 'Apply standardize to Salary',
          method: 'standardize',
          columns: ['Salary'],
          codeReference: 'pipeline.step.1:f1'
        }
      ]
    };

    render(<FeatureEngineeringPanel projectId="p1" />);

    const approveButton = screen.getByRole('button', { name: /Approve Pipeline/i });
    expect(approveButton).toBeEnabled();

    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(mockState.approveVersionMock).toHaveBeenCalledWith('p1', 'v1');
    });
  });

  it('locks editing for approved versions and provides start-new-draft action', async () => {
    mockState.versions.p1[0].status = 'approved';

    render(<FeatureEngineeringPanel projectId="p1" />);

    expect(screen.getByText('Pipeline Approved')).toBeInTheDocument();
    expect(screen.getByTestId('domain-lock')).toHaveTextContent('locked');

    const draftButton = screen.getByRole('button', { name: /Start New Draft/i });
    fireEvent.click(draftButton);

    await waitFor(() => {
      expect(mockState.createDraftVersionMock).toHaveBeenCalledWith('p1', 'New Draft Pipeline');
    });
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

    render(<FeatureEngineeringPanel projectId="p1" />);

    const formatLabel = screen.getByText('Format');
    const formatContainer = formatLabel.closest('div');
    expect(formatContainer).not.toBeNull();

    const formatTrigger = within(formatContainer as HTMLElement).getByRole('combobox');

    await waitFor(() => {
      expect(formatTrigger).toHaveTextContent(/xlsx/i);
    });
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureEngineeringPanel } from '../FeatureEngineeringPanel';

const mockState = vi.hoisted(() => ({
  files: [] as Array<{
    id: string;
    name: string;
    type: 'csv';
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
  hydrateFeaturesMock: vi.fn(),
  createDraftVersionMock: vi.fn(),
  approveVersionMock: vi.fn(),
  setCurrentVersionMock: vi.fn(),
  updateReadinessReportMock: vi.fn(),
  streamFeaturePlanMock: vi.fn(),
  executeToolCallsMock: vi.fn(),
  applyFeatureEngineeringMock: vi.fn()
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
      hydrateFromProject: mockState.hydrateFeaturesMock,
      versions: mockState.versions,
      currentVersionId: mockState.currentVersionId,
      createDraftVersion: mockState.createDraftVersionMock,
      approveVersion: mockState.approveVersionMock,
      setCurrentVersion: mockState.setCurrentVersionMock,
      updateReadinessReport: mockState.updateReadinessReportMock
    })
}));

vi.mock('@/lib/api/llm', () => ({
  streamFeaturePlan: (...args: unknown[]) => mockState.streamFeaturePlanMock(...args),
  executeToolCalls: (...args: unknown[]) => mockState.executeToolCallsMock(...args)
}));

vi.mock('@/lib/api/featureEngineering', () => ({
  applyFeatureEngineering: (...args: unknown[]) => mockState.applyFeatureEngineeringMock(...args)
}));

describe('FeatureEngineeringPanel empty UI handling', () => {
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
        columns: ['First Name', 'Last Name']
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

    mockState.hydrateFromBackendMock.mockClear();
    mockState.upsertFeatureMock.mockClear();
    mockState.removeFeatureMock.mockClear();
    mockState.hydrateFeaturesMock.mockClear();
    mockState.createDraftVersionMock.mockClear();
    mockState.approveVersionMock.mockClear();
    mockState.setCurrentVersionMock.mockClear();
    mockState.updateReadinessReportMock.mockClear();
    mockState.streamFeaturePlanMock.mockReset();
    mockState.executeToolCallsMock.mockClear();
    mockState.applyFeatureEngineeringMock.mockClear();

    mockState.streamFeaturePlanMock.mockImplementation(
      async (_request: unknown, onEvent: (event: unknown) => void) => {
        onEvent({
          type: 'envelope',
          envelope: {
            version: '1',
            kind: 'feature_engineering',
            ui: {
              version: '1',
              kind: 'feature_engineering',
              sections: []
            }
          }
        });
        onEvent({ type: 'done' });
      }
    );
  });

  it('shows explicit feedback when AI returns empty UI envelope', async () => {
    render(<FeatureEngineeringPanel projectId="p1" />);

    const generateButton = screen.getByRole('button', { name: /generate plan/i });
    await waitFor(() => {
      expect(generateButton).toBeEnabled();
    });

    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(
        screen.getByText('AI plan finished without visible output. Try again or refine your goal.')
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByText('No feature pipeline generated yet')
    ).not.toBeInTheDocument();
  });
});

describe('FeatureEngineeringPanel Readiness and Approval', () => {
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
  });

  it('gates approval until features are selected', () => {
    mockState.features = [];
    render(<FeatureEngineeringPanel projectId="p1" />);

    const approveButton = screen.getByRole('button', { name: /Approve Pipeline/i });
    expect(approveButton).toBeDisabled();
    
    expect(screen.getByText('Approval Gate: Readiness Review')).toBeInTheDocument();
  });

  it('renders readiness report sections and enables approval when features are active', async () => {
    mockState.features = [
      {
        id: 'f1',
        projectId: 'p1',
        sourceColumn: 'Salary',
        featureName: 'Salary_Scaled',
        method: 'standard_scale',
        category: 'scaling',
        enabled: true,
        createdAt: new Date().toISOString()
      }
    ];
    mockState.versions.p1[0].readinessReport = {
      dataSummary: {
        addedColumns: ['Salary_Scaled'],
        removedColumns: [],
        renamedColumns: [],
        typeChanges: [],
        nullDeltas: [],
        warnings: ['Target encoding requires split-aware fitting to avoid leakage.']
      },
      steps: [
        {
          id: 'f1',
          name: 'Salary_Scaled',
          rationale: 'Apply standard_scale to Salary',
          method: 'standard_scale',
          columns: ['Salary'],
          codeReference: 'pipeline.step.1:f1'
        }
      ]
    };

    render(<FeatureEngineeringPanel projectId="p1" />);

    const user = userEvent.setup();
    const readinessTab = screen.getByRole('tab', { name: /Readiness Report/i });
    await user.click(readinessTab);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Transformation Steps/i })).toBeInTheDocument();
    });
    
    expect(screen.getByRole('heading', { name: /Data Change Summary/i })).toBeInTheDocument();

    expect(screen.getAllByText('Salary_Scaled')[0]).toBeInTheDocument();
    expect(screen.getAllByText('standard_scale')[0]).toBeInTheDocument();

    const approveButton = screen.getByRole('button', { name: /Approve Pipeline/i });
    expect(approveButton).toBeEnabled();
  });
});

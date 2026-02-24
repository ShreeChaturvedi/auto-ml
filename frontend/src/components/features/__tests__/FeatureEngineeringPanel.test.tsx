import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  hydrateFromBackendMock: vi.fn(),
  upsertFeatureMock: vi.fn(),
  removeFeatureMock: vi.fn(),
  hydrateFeaturesMock: vi.fn(),
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
      hydrateFromProject: mockState.hydrateFeaturesMock
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

    mockState.hydrateFromBackendMock.mockClear();
    mockState.upsertFeatureMock.mockClear();
    mockState.removeFeatureMock.mockClear();
    mockState.hydrateFeaturesMock.mockClear();
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

    const generateButton = screen.getByRole('button', { name: /generate ai plan/i });
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
      screen.queryByText('Generate an AI plan to see feature ideas and controls.')
    ).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadStage } from '../UploadStage';
import { fetchNlSuggestions } from '@/lib/api/query';

vi.mock('@/hooks/useProjectPlans', () => ({
  useProjectPlans: () => ({
    plans: [],
    selectedPlanId: undefined,
    handleOpenPlan: vi.fn(),
    handleCreateNewPlan: vi.fn(),
  })
}));

const files = [
  {
    id: 'file-1',
    name: 'orders.csv',
    type: 'csv',
    size: 128,
    uploadedAt: new Date(),
    projectId: 'p1',
    metadata: {
      datasetId: 'dataset-1'
    }
  }
];

vi.mock('@/lib/api/query', () => ({
  fetchNlSuggestions: vi.fn().mockResolvedValue({
    suggestions: [],
    cached: false,
    schemaFingerprint: 'schema-1'
  })
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      files
    })
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      projects: [
        {
          id: 'p1',
          title: 'Project 1',
          description: '',
          icon: 'Folder',
          color: 'blue',
          metadata: {}
        }
      ],
      updateProject: vi.fn()
    })
}));

vi.mock('../DataUploadPanel', () => ({
  DataUploadPanel: () => <div data-testid="data-upload-panel" />
}));

describe('UploadStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prewarms NL suggestions when advancing from upload', async () => {
    const onNext = vi.fn();

    render(<UploadStage projectId="p1" onNext={onNext} />);

    fireEvent.click(screen.getByTestId('upload-next-button'));

    expect(onNext).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(fetchNlSuggestions).toHaveBeenCalledWith('p1', 8);
    });
  });
});

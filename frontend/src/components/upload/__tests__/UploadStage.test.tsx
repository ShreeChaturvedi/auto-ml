import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadStage } from '../UploadStage';

const mockHandleCreateNewPlan = vi.fn();

vi.mock('@/hooks/useProjectPlans', () => ({
  useProjectPlans: () => ({
    plans: [],
    selectedPlanId: undefined,
    handleOpenPlan: vi.fn(),
    handleCreateNewPlan: mockHandleCreateNewPlan,
  })
}));

const readyFiles = [
  {
    id: 'file-1',
    name: 'orders.csv',
    type: 'csv',
    size: 128,
    uploadedAt: new Date(),
    projectId: 'p1',
    metadata: { datasetId: 'dataset-1' }
  }
];

let mockFiles: typeof readyFiles = [];

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({ files: mockFiles })
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
    mockFiles = [];
  });

  it('hides New Plan button when no files are uploaded', () => {
    mockFiles = [];
    render(<UploadStage projectId="p1" />);

    expect(screen.queryByText('New Plan')).not.toBeInTheDocument();
  });

  it('shows New Plan button when files are uploaded and ready', () => {
    mockFiles = readyFiles;
    render(<UploadStage projectId="p1" />);

    expect(screen.getByText('New Plan')).toBeInTheDocument();
  });

  it('does not render a bottom Next button row', () => {
    mockFiles = readyFiles;
    render(<UploadStage projectId="p1" />);

    expect(screen.queryByTestId('upload-next-button')).not.toBeInTheDocument();
  });
});

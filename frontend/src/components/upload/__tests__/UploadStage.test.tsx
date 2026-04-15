import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadStage } from '../UploadStage';

const mockHandleCreateNewPlan = vi.fn();
const mockHandleRenamePlan = vi.fn();
const mockHandleDeletePlan = vi.fn();

vi.mock('@/hooks/useProjectPlans', () => ({
  useProjectPlans: () => ({
    plans: mockPlans,
    selectedPlanId: mockPlans[0]?.id,
    handleOpenPlan: vi.fn(),
    handleCreateNewPlan: mockHandleCreateNewPlan,
    handleRenamePlan: mockHandleRenamePlan,
    handleDeletePlan: mockHandleDeletePlan,
  }),
  selectActivePlanChatId: () => () => null,
  getActivePlanChatId: () => null,
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
let mockPlans: Array<{ id: string; name: string; content: string }> = [];

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

vi.mock('../PlanChatPane', () => ({
  PlanChatPane: () => <div data-testid="plan-chat-pane" />
}));

vi.mock('../PlanViewerPane', () => ({
  PlanViewerPane: () => <div data-testid="plan-viewer-pane" />
}));

function renderUploadStage(activePlanChatId: string | null) {
  return render(
    <MemoryRouter>
      <UploadStage
        projectId="p1"
        activePlanChatId={activePlanChatId}
        onPlanApproved={vi.fn()}
        onFirstUpload={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('UploadStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles = [];
    mockPlans = [];
  });

  it('does not render a New Plan button in the left ribbon', () => {
    mockFiles = readyFiles;
    renderUploadStage(null);

    expect(screen.queryByText('New Plan')).not.toBeInTheDocument();
  });

  it('does not render a bottom Next button row', () => {
    mockFiles = readyFiles;
    renderUploadStage(null);

    expect(screen.queryByTestId('upload-next-button')).not.toBeInTheDocument();
  });

  it('renders PlanChatPane when activePlanChatId is set', () => {
    mockFiles = readyFiles;
    renderUploadStage('chat-123');

    expect(screen.getByTestId('plan-chat-pane')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-viewer-pane')).not.toBeInTheDocument();
  });

  it('renders PlanViewerPane when activePlanChatId is null and plans exist', () => {
    mockFiles = readyFiles;
    mockPlans = [{ id: 'plan-1', name: 'My Plan', content: '# Plan' }];
    renderUploadStage(null);

    expect(screen.getByTestId('plan-viewer-pane')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-chat-pane')).not.toBeInTheDocument();
  });

  it('hides right column when no activePlanChatId and no plans', () => {
    mockFiles = readyFiles;
    mockPlans = [];
    renderUploadStage(null);

    expect(screen.queryByTestId('plan-chat-pane')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plan-viewer-pane')).not.toBeInTheDocument();
  });

  it('does not render New Plan button even when plans exist', () => {
    mockFiles = readyFiles;
    mockPlans = [{ id: 'plan-1', name: 'My Plan', content: '# Plan' }];
    renderUploadStage(null);

    expect(screen.queryByText('New Plan')).not.toBeInTheDocument();
  });
});

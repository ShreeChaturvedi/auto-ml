import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Sidebar } from '../Sidebar';

// ── Mutable store state ──────────────────────────────────────────────
const setActiveProjectMock = vi.fn();

const TEST_PROJECT = {
  id: 'p1',
  title: 'Test Project',
  description: 'desc',
  icon: 'Folder',
  color: 'blue' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  unlockedPhases: ['upload', 'data-viewer'],
  currentPhase: 'upload' as const,
  completedPhases: [],
  metadata: {},
};

let storeState: {
  activeProjectId: string | null;
  projects: typeof TEST_PROJECT[];
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ ...storeState, setActiveProject: setActiveProjectMock }),
    { getState: () => ({ ...storeState, setActiveProject: setActiveProjectMock }) }
  ),
}));

vi.mock('@/stores/planChatStore', () => ({
  usePlanChatStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ chats: {}, isInitialized: true }),
    { getState: () => ({ initialize: vi.fn(() => Promise.resolve()) }) },
  ),
}));

vi.mock('@/stores/workbookRegistryStore', () => ({
  useWorkbookRegistryStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        preprocessing: [],
        'feature-engineering': [],
        training: [],
        activeWorkbookIds: {},
        deleteHandlers: {},
        setActiveWorkbookId: vi.fn()
      }),
    {
      getState: () => ({
        preprocessing: [],
        'feature-engineering': [],
        training: [],
        activeWorkbookIds: {},
        deleteHandlers: {},
        addWorkbook: vi.fn(),
        setActiveWorkbookId: vi.fn(),
      }),
    },
  ),
  type: { WorkbookPhase: '' },
}));

vi.mock('@/hooks/useProjectThemeColor', () => ({
  useProjectThemeColor: () => ({ themeColor: '#1d4ed8' }),
}));

// Stub heavy children that aren't relevant to this test
vi.mock('@/components/projects/ProjectDialog', () => ({
  ProjectDialog: () => null,
}));
vi.mock('@/components/projects/UserProfile', () => ({
  UserProfile: () => <div data-testid="user-profile" />,
}));
vi.mock('@/components/projects/ProjectList', () => ({
  ProjectList: () => <div data-testid="project-list">Project list</div>,
}));
vi.mock('@/components/experiments/SeedModelDialog', () => ({
  SeedModelDialog: () => null,
}));
vi.mock('../sidebar/PlanSubtabs', () => ({
  PlanSubtabs: () => <div data-testid="plan-subtabs">Plan subtabs</div>,
}));
vi.mock('../sidebar/FileSubtabs', () => ({
  FileSubtabs: () => <div data-testid="file-subtabs">File subtabs</div>,
}));
vi.mock('../sidebar/WorkbookSubtabs', () => ({
  WorkbookSubtabs: () => null,
}));
vi.mock('../sidebar/ModelSubtabs', () => ({
  ModelSubtabs: () => null,
}));

// ── Helpers ──────────────────────────────────────────────────────────
function renderSidebar(initialPath = '/project/p1/upload') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<Sidebar collapsed={false} onToggleCollapse={vi.fn()} />} />
        <Route path="/project/:projectId/:phase" element={<Sidebar collapsed={false} onToggleCollapse={vi.fn()} />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────
describe('Sidebar → Home navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState = {
      activeProjectId: 'p1',
      projects: [TEST_PROJECT],
    };
  });

  it('shows phase tree with subtabs when a project is active', () => {
    renderSidebar();

    // Phase labels from WORKFLOW_PHASES should be visible
    expect(screen.getByText('Data Upload')).toBeInTheDocument();
    expect(screen.getByText('Explorer')).toBeInTheDocument();

    // Subtabs rendered for expanded phases
    expect(screen.getByTestId('plan-subtabs')).toBeInTheDocument();

    // ProjectList should NOT be present
    expect(screen.queryByTestId('project-list')).not.toBeInTheDocument();
  });

  it('calls setActiveProject(null) when home button is clicked', async () => {
    const user = userEvent.setup();
    renderSidebar();

    const homeButton = screen.getByRole('button', { name: /go to projects/i });
    await user.click(homeButton);

    expect(setActiveProjectMock).toHaveBeenCalledWith(null);
  });

  it('switches to ProjectList with no fallback flash after going home', () => {
    const { rerender } = renderSidebar();

    // Verify phase tree is showing
    expect(screen.getByText('Data Upload')).toBeInTheDocument();
    expect(screen.queryByTestId('project-list')).not.toBeInTheDocument();

    // Simulate the store update that handleGoHome triggers
    storeState = { activeProjectId: null, projects: [TEST_PROJECT] };

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar collapsed={false} onToggleCollapse={vi.fn()} />
      </MemoryRouter>,
    );

    // ProjectList should now be visible
    expect(screen.getByTestId('project-list')).toBeInTheDocument();

    // Phase tree content should be gone
    expect(screen.queryByText('Data Upload')).not.toBeInTheDocument();

    // The old fallback text that caused the visual flash must NEVER appear
    expect(screen.queryByText('Select a project to view phases')).not.toBeInTheDocument();
  });

  it('renders nothing (not a fallback div) when projectId has no matching project', () => {
    // Edge case: WorkflowPhaseTree receives a projectId that doesn't exist in the store.
    // Before the fix, this rendered a visible "Select a project" div.
    // After the fix, it returns null.
    storeState = { activeProjectId: 'nonexistent', projects: [TEST_PROJECT] };

    renderSidebar();

    // The component should render the phase tree wrapper but WorkflowPhaseTree
    // returns null for the mismatched projectId — no phase labels, no fallback text
    expect(screen.queryByText('Data Upload')).not.toBeInTheDocument();
    expect(screen.queryByText('Select a project to view phases')).not.toBeInTheDocument();
  });

  it('highlights the route phase even when persisted currentPhase is stale', () => {
    storeState = {
      activeProjectId: 'p1',
      projects: [{ ...TEST_PROJECT, currentPhase: 'upload' }],
    };

    renderSidebar('/project/p1/data-viewer');

    const explorerButton = screen.getByRole('button', { name: 'Explorer' });
    const uploadButton = screen.getByRole('button', { name: 'Data Upload' });

    expect(explorerButton.parentElement).toHaveClass('bg-muted');
    expect(uploadButton.parentElement).not.toHaveClass('bg-muted');
  });
});

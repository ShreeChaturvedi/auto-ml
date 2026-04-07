import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowPhaseTree } from '../WorkflowPhaseTree';

const projectState = {
  projects: [
    {
      id: 'p1',
      currentPhase: 'upload',
      unlockedPhases: ['upload', 'data-viewer'],
    }
  ],
  activeProjectId: 'p1',
  setCurrentPhase: vi.fn(),
  isPhaseUnlocked: (projectId: string, phase: string) =>
    projectId === 'p1' && ['upload', 'data-viewer'].includes(phase),
  setActiveProject: vi.fn()
};

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector: (state: typeof projectState) => unknown) => selector(projectState),
    { getState: () => projectState }
  )
}));

vi.mock('@/stores/planChatStore', () => ({
  usePlanChatStore: Object.assign(
    (selector: (state: { isInitialized: boolean }) => unknown) => selector({ isInitialized: true }),
    { getState: () => ({ initialize: vi.fn() }) }
  )
}));

vi.mock('@/stores/workbookRegistryStore', () => ({
  useWorkbookRegistryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ preprocessing: [], 'feature-engineering': [], training: [] })
}));

vi.mock('@/hooks/useProjectThemeColor', () => ({
  useProjectThemeColor: vi.fn()
}));

vi.mock('../sidebar/PlanSubtabs', () => ({
  PlanSubtabs: () => <div data-testid="plan-subtabs">plan subtabs</div>
}));

vi.mock('../sidebar/FileSubtabs', () => ({
  FileSubtabs: () => <div data-testid="file-subtabs">file subtabs</div>
}));

vi.mock('../sidebar/WorkbookSubtabs', () => ({
  WorkbookSubtabs: () => <div data-testid="workbook-subtabs">workbook subtabs</div>
}));

vi.mock('../sidebar/ModelSubtabs', () => ({
  ModelSubtabs: () => <div data-testid="model-subtabs">model subtabs</div>
}));

vi.mock('../SeedModelDialog', () => ({
  SeedModelDialog: () => null
}));

// Mock sidebar prefs — default to accordion ON for backward-compatible test
vi.mock('@/lib/sidebarPrefs', () => ({
  getSidebarAccordionPref: vi.fn(() => true),
  setSidebarAccordionPref: vi.fn(),
  subscribeSidebarAccordionPref: vi.fn(() => () => {}),
}));

function renderTree(initialPath = '/project/p1/upload') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/project/:projectId/:phase" element={<WorkflowPhaseTree projectId="p1" />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Subtabs are lazily mounted on first expand; check expansion via data attribute. */
function isSubtabExpanded(testId: string): boolean {
  const el = screen.queryByTestId(testId);
  if (!el) return false;
  const grid = el.closest('[data-expanded]');
  return grid?.getAttribute('data-expanded') === 'true';
}

describe('WorkflowPhaseTree', () => {
  beforeEach(() => {
    projectState.projects[0].currentPhase = 'upload';
  });

  it('expands the active phase subtabs on render', () => {
    renderTree();
    expect(isSubtabExpanded('plan-subtabs')).toBe(true);
    // data-viewer subtabs not mounted until that phase is first expanded
    expect(screen.queryByTestId('file-subtabs')).not.toBeInTheDocument();
  });

  it('collapses previously active subtabs when navigation switches phases (accordion mode)', async () => {
    const { getSidebarAccordionPref } = await import('@/lib/sidebarPrefs');
    (getSidebarAccordionPref as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const user = userEvent.setup();
    renderTree();

    expect(isSubtabExpanded('plan-subtabs')).toBe(true);

    await user.click(screen.getByRole('button', { name: /^Explorer$/ }));

    await waitFor(() => {
      expect(isSubtabExpanded('file-subtabs')).toBe(true);
    });
    expect(isSubtabExpanded('plan-subtabs')).toBe(false);
  });

  it('keeps other phases expanded in independent mode', async () => {
    const { getSidebarAccordionPref } = await import('@/lib/sidebarPrefs');
    (getSidebarAccordionPref as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const user = userEvent.setup();
    renderTree();

    expect(isSubtabExpanded('plan-subtabs')).toBe(true);

    await user.click(screen.getByRole('button', { name: /^Explorer$/ }));

    await waitFor(() => {
      expect(isSubtabExpanded('file-subtabs')).toBe(true);
    });
    // In independent mode, upload subtabs stay expanded
    expect(isSubtabExpanded('plan-subtabs')).toBe(true);
  });

  it('toggles expand/collapse with chevron in independent mode', async () => {
    const { getSidebarAccordionPref } = await import('@/lib/sidebarPrefs');
    (getSidebarAccordionPref as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const user = userEvent.setup();
    renderTree();

    // Upload is auto-expanded because it's the active phase
    expect(isSubtabExpanded('plan-subtabs')).toBe(true);

    // Click chevron to collapse upload
    await user.click(screen.getByRole('button', { name: /Collapse Data Upload/ }));
    await waitFor(() => {
      expect(isSubtabExpanded('plan-subtabs')).toBe(false);
    });

    // Click chevron again to re-expand upload
    await user.click(screen.getByRole('button', { name: /Expand Data Upload/ }));
    await waitFor(() => {
      expect(isSubtabExpanded('plan-subtabs')).toBe(true);
    });
  });

  it('locked phases cannot be expanded or navigated to', async () => {
    const user = userEvent.setup();
    renderTree();

    // Preprocessing is not in unlockedPhases — it should be locked
    const processingButton = screen.getByTestId('workflow-phase-button-preprocessing');
    expect(processingButton).toBeDisabled();

    // Locked phases don't render the expandable grid wrapper at all
    const processingPhase = screen.getByTestId('workflow-phase-preprocessing');
    expect(processingPhase.querySelector('[data-expanded]')).toBeNull();

    // Clicking the disabled button should not trigger navigation
    await user.click(processingButton);
    expect(projectState.setCurrentPhase).not.toHaveBeenCalled();
  });

  it('phase highlight follows route, not store currentPhase', () => {
    // Store says currentPhase is 'upload', but route says data-viewer
    projectState.projects[0].currentPhase = 'upload';
    renderTree('/project/p1/data-viewer');

    const dataViewerPhase = screen.getByTestId('workflow-phase-data-viewer');
    expect(dataViewerPhase).toHaveClass('bg-muted');

    const uploadPhase = screen.getByTestId('workflow-phase-upload');
    expect(uploadPhase).not.toHaveClass('bg-muted');
  });

  it('shimmer fires on newly unlocked phases', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/project/p1/upload']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<WorkflowPhaseTree projectId="p1" />} />
        </Routes>
      </MemoryRouter>
    );

    // Initially, only upload and data-viewer are unlocked — no shimmer
    const uploadLabel = screen.getByTestId('workflow-phase-button-upload').querySelector('span');
    expect(uploadLabel).not.toHaveClass('shimmer-text-once');

    // Simulate unlocking preprocessing by updating the store state
    projectState.projects[0].unlockedPhases = ['upload', 'data-viewer', 'preprocessing'] ;
    projectState.isPhaseUnlocked = (projectId: string, phase: string) =>
      projectId === 'p1' && ['upload', 'data-viewer', 'preprocessing'].includes(phase);

    // Re-render the same component tree so the ref persists and the useEffect detects the change
    rerender(
      <MemoryRouter initialEntries={['/project/p1/upload']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<WorkflowPhaseTree projectId="p1" />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const preprocessingLabel = screen.getByTestId('workflow-phase-button-preprocessing').querySelector('span');
      expect(preprocessingLabel).toHaveClass('shimmer-text-once');
    });

    // Restore original state
    projectState.projects[0].unlockedPhases = ['upload', 'data-viewer'] ;
    projectState.isPhaseUnlocked = (projectId: string, phase: string) =>
      projectId === 'p1' && ['upload', 'data-viewer'].includes(phase);
  });

  it('accordion mode: clicking chevron collapses the only expanded phase', async () => {
    const { getSidebarAccordionPref } = await import('@/lib/sidebarPrefs');
    (getSidebarAccordionPref as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const user = userEvent.setup();
    renderTree();

    // Upload is auto-expanded as active phase
    expect(isSubtabExpanded('plan-subtabs')).toBe(true);

    // Click chevron to collapse upload — in accordion mode this should leave nothing expanded
    await user.click(screen.getByRole('button', { name: /Collapse Data Upload/ }));
    await waitFor(() => {
      expect(isSubtabExpanded('plan-subtabs')).toBe(false);
    });

    // Explorer should also remain collapsed (accordion didn't auto-expand anything)
    expect(isSubtabExpanded('file-subtabs')).toBe(false);
  });
});

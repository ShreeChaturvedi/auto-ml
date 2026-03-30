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

/** Subtabs are always mounted (grid-rows animation); check expansion via data attribute. */
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
    // Upload subtabs should be expanded (opacity-100)
    expect(isSubtabExpanded('plan-subtabs')).toBe(true);
    // File subtabs exist but are collapsed (opacity-0)
    expect(screen.getByTestId('file-subtabs')).toBeInTheDocument();
    expect(isSubtabExpanded('file-subtabs')).toBe(false);
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
});

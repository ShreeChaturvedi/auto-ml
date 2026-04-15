/**
 * NotebookSubtabs tests — basic rendering and interaction coverage for the
 * sidebar section that lists standalone notebooks.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { NotebookSubtabs } from '../NotebookSubtabs';
import { useNotebookStore } from '@/stores/notebookStore';
import type { Notebook } from '@/types/notebook';

// ── Mocks ─────────────────────────────────────────────────────

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const notebookApi = vi.hoisted(() => ({
  listNotebooks: vi.fn(),
  createNotebook: vi.fn(),
  updateNotebook: vi.fn(),
  deleteNotebook: vi.fn(),
}));

const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/notebooks', () => ({
  listNotebooks: (...args: unknown[]) => notebookApi.listNotebooks(...args),
  createNotebook: (...args: unknown[]) => notebookApi.createNotebook(...args),
  updateNotebook: (...args: unknown[]) => notebookApi.updateNotebook(...args),
  deleteNotebook: (...args: unknown[]) => notebookApi.deleteNotebook(...args),
}));

const dataStoreState = vi.hoisted(() => ({
  activeFileTabId: null as string | null,
  fileTabType: null as 'file' | 'notebook' | null,
  openNotebookTab: vi.fn(),
}));

vi.mock('@/stores/dataStore', () => {
  const state = () => ({
    activeFileTabId: dataStoreState.activeFileTabId,
    fileTabType: dataStoreState.fileTabType,
    openNotebookTab: dataStoreState.openNotebookTab,
  });
  return {
    useDataStore: Object.assign(
      (selector: (s: unknown) => unknown) => selector(state()),
      { getState: state }
    ),
  };
});

// Toast: silence it so tests don't need a toaster mounted.
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

// ── Helpers ───────────────────────────────────────────────────

function makeNotebook(overrides: Partial<Notebook> = {}): Notebook {
  return {
    notebookId: 'nb-1',
    projectId: 'proj-1',
    name: 'Notebook 1',
    kind: 'standalone',
    metadata: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderSubtabs(projectId = 'proj-1') {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[`/project/${projectId}/upload`]}>
        <NotebookSubtabs projectId={projectId} />
      </MemoryRouter>
    </TooltipProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────

describe('NotebookSubtabs', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    notebookApi.listNotebooks.mockReset();
    notebookApi.createNotebook.mockReset();
    notebookApi.updateNotebook.mockReset();
    notebookApi.deleteNotebook.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    dataStoreState.activeFileTabId = null;
    dataStoreState.fileTabType = null;
    dataStoreState.openNotebookTab.mockReset();
    // Reset shared notebook store state between tests so one test's
    // loadNotebooks doesn't leak into the next.
    useNotebookStore.setState({
      notebooks: [],
      activeNotebookId: null,
      notebook: null,
      currentProjectId: null
    });
  });

  it('renders the "New notebook" action and no rows when the list is empty', async () => {
    notebookApi.listNotebooks.mockResolvedValue([]);

    renderSubtabs();

    // "New notebook" action row is always present.
    expect(await screen.findByText('New notebook')).toBeInTheDocument();

    // Wait for the async refresh to settle. The component now seeds the
    // shared store via `loadNotebooks`, which calls `listNotebooks(projectId)`
    // without a kind filter — the component filters to `standalone` itself.
    await waitFor(() => {
      expect(notebookApi.listNotebooks).toHaveBeenCalledWith('proj-1');
    });

    // No standalone notebook rows are rendered.
    expect(screen.queryByText('Notebook 1')).not.toBeInTheDocument();
  });

  it('renders a row for each standalone notebook returned by the API', async () => {
    notebookApi.listNotebooks.mockResolvedValue([
      makeNotebook({ notebookId: 'nb-a', name: 'Exploration A' }),
      makeNotebook({ notebookId: 'nb-b', name: 'Exploration B' }),
    ]);

    renderSubtabs();

    expect(await screen.findByText('Exploration A')).toBeInTheDocument();
    expect(await screen.findByText('Exploration B')).toBeInTheDocument();
  });

  it('opens the create-notebook dialog when the "New notebook" action is clicked', async () => {
    notebookApi.listNotebooks.mockResolvedValue([]);
    const user = userEvent.setup();

    renderSubtabs();

    await user.click(await screen.findByText('New notebook'));

    // Dialog title should now be visible.
    expect(await screen.findByText('Create a standalone notebook in this project.')).toBeInTheDocument();
  });

  it('shows a success toast when a notebook is created', async () => {
    notebookApi.listNotebooks.mockResolvedValue([]);
    notebookApi.createNotebook.mockResolvedValue(
      makeNotebook({ notebookId: 'nb-new', name: 'Notebook 1' })
    );
    const user = userEvent.setup();

    renderSubtabs();

    await user.click(await screen.findByText('New notebook'));
    await user.click(await screen.findByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith('Notebook 1 created');
    });
  });

  it('clicking a notebook row opens the notebook tab and navigates to the data viewer', async () => {
    notebookApi.listNotebooks.mockResolvedValue([
      makeNotebook({ notebookId: 'nb-click', name: 'Clickable Notebook', projectId: 'proj-xyz' }),
    ]);
    const user = userEvent.setup();

    renderSubtabs('proj-xyz');

    const row = await screen.findByText('Clickable Notebook');
    await user.click(row);

    expect(dataStoreState.openNotebookTab).toHaveBeenCalledWith('nb-click');
    // We started at /project/proj-xyz/upload (not the data viewer),
    // so navigation should have fired.
    expect(navigateMock).toHaveBeenCalledWith('/project/proj-xyz/data-viewer');
  });
});

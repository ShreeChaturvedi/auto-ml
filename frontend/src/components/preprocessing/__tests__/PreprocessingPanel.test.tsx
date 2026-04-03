import { render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { PreprocessingPanel } from '../PreprocessingPanel';

const mocks = vi.hoisted(() => ({
  agenticShell: vi.fn(),
  loadTables: vi.fn(),
  selectDataset: vi.fn(),
  setNextRunCellMode: vi.fn(),
  hydrateRunById: vi.fn(),
  evaluateReplayCompatibility: vi.fn(),
  clearRun: vi.fn(),
  toolbarRight: vi.fn()
}));

// Mock AgenticShell — we already have a dedicated smoke test for it
vi.mock('@/components/agentic/AgenticShell', () => ({
  AgenticShell: (props: unknown) => {
    mocks.agenticShell(props);
    return <div data-testid="agentic-shell" />;
  }
}));

vi.mock('@/components/agentic/ChatMessageRenderer', () => ({
  ChatMessageRenderer: () => null
}));

vi.mock('@/components/agentic/useLifecycleCards', () => ({
  useLifecycleCards: () => ({ lifecycleCards: [], clearLifecycleCards: vi.fn() })
}));

vi.mock('@/hooks/useWorkflowPlaceholders', () => ({
  useWorkflowPlaceholders: () => []
}));

vi.mock('../PreprocessingAdapter', () => ({
  createPreprocessingAdapter: () => ({
    buildRequest: vi.fn(async () => undefined),
    toolRegistry: {},
    toolUiRegistry: {},
    tipsProvider: () => [],
    preserveToolHistoryBetweenPrompts: true
  })
}));

vi.mock('../continuityPrompt', () => ({
  buildDatasetContinuityPrompt: () => null
}));

vi.mock('../PreprocessingDialogs', () => ({
  RenameTabDialog: () => null
}));

vi.mock('../DatasetSelector', () => ({
  DatasetSelector: () => null
}));

vi.mock('../useDatasetSelectorTrigger', () => ({
  useDatasetSelectorTrigger: () => ({
    forceOpen: false,
    openSelector: vi.fn()
  })
}));

vi.mock('../PreprocessingToolbar', () => ({
  PreprocessingToolbarLeft: () => null,
  PreprocessingToolbarRight: (props: unknown) => {
    mocks.toolbarRight(props);
    return null;
  }
}));

vi.mock('../hooks/usePreprocessingTabs', () => ({
  usePreprocessingTabs: () => ({
    tabs: [{ id: 'tab-1', label: 'Tab 1', notebookId: null }],
    activeTab: { id: 'tab-1', label: 'Tab 1', notebookId: null },
    tabsReady: true,
    buildTabStorageKey: (id: string) => `prep-${id}`,
    handleTabSwitch: vi.fn(),
    handleNewTab: vi.fn(),
    handleDeleteTab: vi.fn(),
    openRenameTabDialog: vi.fn(),
    handleRenameTab: vi.fn(),
    renameTabDialogOpen: false,
    setRenameTabDialogOpen: vi.fn(),
    renameTabName: '',
    setRenameTabName: vi.fn(),
    resetActiveTab: vi.fn(),
    invalidateActiveTabSession: vi.fn()
  })
}));

vi.mock('@/stores/preprocessingStore', () => ({
  usePreprocessingStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        activeDatasetId: 'ds-1',
        selectedDatasetId: 'ds-1',
        datasets: [{ datasetId: 'ds-1', name: 'test', filename: 'test.csv', sizeBytes: 0, columns: [] }],
        tables: [
          { datasetId: 'ds-1', name: 'test', filename: 'test.csv', sizeBytes: 0, columns: [] },
          { datasetId: 'ds-2', name: 'stale', filename: 'stale.csv', sizeBytes: 0, columns: [] }
        ],
        nextRunCellMode: 'continue',
        runId: null,
        isLoadingTables: false,
        controllerSummary: null,
        loadTables: mocks.loadTables,
        selectDataset: mocks.selectDataset,
        setNextRunCellMode: mocks.setNextRunCellMode,
        hydrateRunById: mocks.hydrateRunById,
        evaluateReplayCompatibility: mocks.evaluateReplayCompatibility,
        clearRun: mocks.clearRun
      }),
    { getState: () => ({ activeDatasetId: 'ds-1', selectedDatasetId: 'ds-1', runId: null, datasets: [], tables: [] }), setState: vi.fn() }
  )
}));

vi.mock('@/stores/workflowSessionStore', () => ({
  buildWorkflowSessionKey: () => 'session-key',
  useWorkflowSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ sessions: {} }),
    { getState: () => ({ sessions: {} }), setState: vi.fn() }
  )
}));

describe('PreprocessingPanel smoke test', () => {
  it('loads preprocessing tables on mount', async () => {
    mocks.agenticShell.mockReset();
    mocks.loadTables.mockReset();
    mocks.toolbarRight.mockReset();

    render(
      <MemoryRouter initialEntries={['/project/test-project/preprocessing']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<PreprocessingPanel />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mocks.loadTables).toHaveBeenCalledWith('test-project');
    });
  });

  it('passes the current dataset state to the toolbar', async () => {
    mocks.agenticShell.mockReset();
    mocks.loadTables.mockReset();
    mocks.toolbarRight.mockReset();

    render(
      <MemoryRouter initialEntries={['/project/test-project/preprocessing']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<PreprocessingPanel />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mocks.agenticShell).toHaveBeenCalledWith(expect.objectContaining({
        toolbarRight: expect.anything()
      }));
    });

    const latestProps = mocks.agenticShell.mock.calls.at(-1)?.[0] as {
      toolbarRight: ReactElement<{
        selectedDatasetId: string;
        tables: Array<{ datasetId: string; filename: string }>;
        isLoadingTables: boolean;
      }>;
    };

    expect(latestProps.toolbarRight.props).toEqual(expect.objectContaining({
      selectedDatasetId: 'ds-1',
      tables: expect.arrayContaining([
        expect.objectContaining({ datasetId: 'ds-1', filename: 'test.csv' }),
        expect.objectContaining({ datasetId: 'ds-2', filename: 'stale.csv' })
      ]),
      isLoadingTables: false
    }));
  });

  it('mounts without "Maximum update depth exceeded" error', () => {
    mocks.agenticShell.mockReset();
    mocks.loadTables.mockReset();
    mocks.toolbarRight.mockReset();

    expect(() => {
      render(
        <MemoryRouter initialEntries={['/project/test-project/preprocessing']}>
          <Routes>
            <Route path="/project/:projectId/:phase" element={<PreprocessingPanel />} />
          </Routes>
        </MemoryRouter>
      );
    }).not.toThrow();
  });
});

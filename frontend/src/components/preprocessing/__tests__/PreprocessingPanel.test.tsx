import { render, waitFor } from '@testing-library/react';
import React, { type ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { PreprocessingPanel } from '../PreprocessingPanel';

const mocks = vi.hoisted(() => ({
  agenticShell: vi.fn(),
  agenticShellMounts: 0,
  agenticShellUnmounts: 0,
  activeTabId: 'tab-1',
  buildDatasetContinuityPrompt: vi.fn(),
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
    React.useEffect(() => {
      mocks.agenticShellMounts += 1;
      return () => {
        mocks.agenticShellUnmounts += 1;
      };
    }, []);
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
  buildDatasetContinuityPrompt: (...args: unknown[]) => mocks.buildDatasetContinuityPrompt(...args)
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
    tabs: [
      { id: 'tab-1', label: 'Tab 1', notebookId: null, storageVersion: 0 },
      { id: 'tab-2', label: 'Tab 2', notebookId: null, storageVersion: 0 }
    ],
    activeTab: {
      id: mocks.activeTabId,
      label: mocks.activeTabId === 'tab-2' ? 'Tab 2' : 'Tab 1',
      notebookId: null,
      storageVersion: 0
    },
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
  const renderPanel = () => render(
    <MemoryRouter initialEntries={['/project/test-project/preprocessing']}>
      <Routes>
        <Route path="/project/:projectId/:phase" element={<PreprocessingPanel />} />
      </Routes>
    </MemoryRouter>
  );

  it('loads preprocessing tables on mount', async () => {
    mocks.agenticShell.mockReset();
    mocks.agenticShellMounts = 0;
    mocks.agenticShellUnmounts = 0;
    mocks.activeTabId = 'tab-1';
    mocks.loadTables.mockReset();
    mocks.toolbarRight.mockReset();

    renderPanel();

    await waitFor(() => {
      expect(mocks.loadTables).toHaveBeenCalledWith('test-project');
    });
  });

  it('passes the current dataset state to the toolbar', async () => {
    mocks.agenticShell.mockReset();
    mocks.agenticShellMounts = 0;
    mocks.agenticShellUnmounts = 0;
    mocks.activeTabId = 'tab-1';
    mocks.loadTables.mockReset();
    mocks.toolbarRight.mockReset();

    renderPanel();

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
    mocks.agenticShellMounts = 0;
    mocks.agenticShellUnmounts = 0;
    mocks.activeTabId = 'tab-1';
    mocks.loadTables.mockReset();
    mocks.toolbarRight.mockReset();

    expect(() => {
      renderPanel();
    }).not.toThrow();
  });

  it('always prepares prompts to continue in the current workbook dataset', async () => {
    mocks.agenticShell.mockReset();
    mocks.agenticShellMounts = 0;
    mocks.agenticShellUnmounts = 0;
    mocks.activeTabId = 'tab-1';
    mocks.buildDatasetContinuityPrompt.mockReset();
    mocks.buildDatasetContinuityPrompt.mockReturnValue('prepared prompt');
    mocks.setNextRunCellMode.mockReset();

    renderPanel();

    await waitFor(() => {
      expect(mocks.agenticShell).toHaveBeenCalled();
    });

    const latestProps = mocks.agenticShell.mock.calls.at(-1)?.[0] as {
      beforeSubmit: (prompt: string) => Promise<string | null>;
    };

    await expect(latestProps.beforeSubmit('Normalize missing values')).resolves.toBe('prepared prompt');
    expect(mocks.setNextRunCellMode).toHaveBeenCalledWith('continue');
    expect(mocks.buildDatasetContinuityPrompt).toHaveBeenCalledWith(
      'Normalize missing values',
      'continue',
      {
        datasetId: 'ds-1',
        datasetLabel: 'test.csv'
      }
    );
  });

  it('does not remount AgenticShell when switching preprocessing workbooks', async () => {
    mocks.agenticShell.mockReset();
    mocks.agenticShellMounts = 0;
    mocks.agenticShellUnmounts = 0;
    mocks.activeTabId = 'tab-1';

    const view = renderPanel();

    await waitFor(() => {
      expect(mocks.agenticShellMounts).toBe(1);
    });

    mocks.activeTabId = 'tab-2';
    view.rerender(
      <MemoryRouter initialEntries={['/project/test-project/preprocessing']}>
        <Routes>
          <Route path="/project/:projectId/:phase" element={<PreprocessingPanel />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mocks.agenticShellMounts).toBe(1);
      expect(mocks.agenticShellUnmounts).toBe(0);
    });
  });
});

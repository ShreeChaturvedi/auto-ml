import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { PreprocessingPanel } from '../PreprocessingPanel';

// Mock AgenticShell — we already have a dedicated smoke test for it
vi.mock('@/components/agentic/AgenticShell', () => ({
  AgenticShell: () => <div data-testid="agentic-shell" />
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
    suggestionProvider: () => [],
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
    selectorOpen: false,
    setSelectorOpen: vi.fn(),
    triggerSelector: vi.fn()
  })
}));

vi.mock('../PreprocessingToolbar', () => ({
  PreprocessingToolbarLeft: () => null,
  PreprocessingToolbarRight: () => null
}));

vi.mock('../DatasetContinuityDialog', () => ({
  DatasetContinuityDialog: () => null
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
        tables: [{ datasetId: 'ds-1', name: 'test', filename: 'test.csv', sizeBytes: 0, columns: [] }],
        nextRunCellMode: 'continue',
        runId: null,
        isLoadingTables: false,
        controllerSummary: null,
        setActiveDataset: vi.fn(),
        loadTables: vi.fn(),
        selectDataset: vi.fn(),
        setNextRunCellMode: vi.fn(),
        hydrateRunById: vi.fn(),
        evaluateReplayCompatibility: vi.fn(),
        clearRun: vi.fn()
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
  it('mounts without "Maximum update depth exceeded" error', () => {
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

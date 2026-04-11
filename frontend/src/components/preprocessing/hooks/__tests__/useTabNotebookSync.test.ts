/**
 * useTabNotebookSync tests
 *
 * This hook reconciles preprocessing tabs with notebooks.
 * The bug: notebooks were created/adopted WITHOUT setting phase metadata,
 * so useSidebarNotebookTree (which filters by metadata.phase) found nothing.
 *
 * The fix added:
 * 1. buildPreprocessingMetadata helper
 * 2. Metadata passed to createNotebook and adopted notebooks
 * 3. Step 2.5 in reconcileTabNotebookMappings to backfill stale metadata
 *
 * These tests verify metadata is ALWAYS set correctly on all code paths.
 *
 * IMPORTANT: The hook has two auto-firing useEffects that call
 * reconcileTabNotebookMappings and ensureNotebookForTab. To avoid infinite
 * loops in tests, we either:
 * - Pass activeTab: undefined to disable the ensure-notebook effect
 * - Ensure store currentProjectId doesn't match projectId to disable both effects
 * Then call the functions under test directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { MutableRefObject } from 'react';

// ── Mocks ─────────────────────────────────────────────────────

const listNotebooksMock = vi.fn();
const listCellsMock = vi.fn();
const createNotebookApiMock = vi.fn();
const updateNotebookApiMock = vi.fn();
const deleteNotebookApiMock = vi.fn();

vi.mock('@/lib/api/notebooks', () => ({
  listNotebooks: (...args: unknown[]) => listNotebooksMock(...args),
  createNotebook: (...args: unknown[]) => createNotebookApiMock(...args),
  updateNotebook: (...args: unknown[]) => updateNotebookApiMock(...args),
  deleteNotebook: (...args: unknown[]) => deleteNotebookApiMock(...args),
  listCells: (...args: unknown[]) => listCellsMock(...args),
  getCell: vi.fn(),
  createCell: vi.fn(),
  updateCell: vi.fn(),
  deleteCell: vi.fn(),
  reorderCells: vi.fn(),
  runCell: vi.fn(),
  getCellLock: vi.fn(),
  getCellOutputUrl: vi.fn(),
  parseOutputRefUrl: vi.fn(),
  getPythonCompletions: vi.fn(),
  interruptKernel: vi.fn(),
  restartKernel: vi.fn()
}));

vi.mock('@/lib/websocket/notebookClient', () => ({
  getNotebookWSClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    isConnected: false,
    on: vi.fn(() => vi.fn())
  }))
}));

import { useNotebookStore } from '@/stores/notebookStore';
import { useTabNotebookSync } from '../useTabNotebookSync';
import type { PreprocessingWorkbook } from '../../preprocessingTabUtils';
import type { Notebook } from '@/types/notebook';

// ── Fixtures ──────────────────────────────────────────────────

function makeTab(overrides: Partial<PreprocessingWorkbook> = {}): PreprocessingWorkbook {
  return {
    id: 'tab-1',
    name: 'Processing 1',
    notebookId: null,
    snapshot: {
      selectedDatasetId: null,
      runId: null,
      timeline: [],
      stepBindings: {},
      replayReport: null
    },
    storageVersion: 0,
    ...overrides
  };
}

function makeNotebook(overrides: Partial<Notebook> = {}): Notebook {
  return {
    notebookId: 'nb-1',
    projectId: 'proj-1',
    name: 'Notebook 1',
    kind: 'phase',
    metadata: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

function makeRef<T>(value: T): MutableRefObject<T> {
  return { current: value };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Render the hook with auto-effects disabled.
 *
 * - Store currentProjectId is set to a DIFFERENT value to prevent the
 *   reconciliation useEffect from firing.
 * - activeTab is undefined to prevent the ensure-notebook useEffect.
 *
 * Tests call reconcileTabNotebookMappings / ensureNotebookForTab directly
 * after setting up the store's currentProjectId inside `act`.
 */
function renderSyncHook(opts: {
  tabs: PreprocessingWorkbook[];
  activeTabId: string;
  projectId?: string;
}) {
  const tabsRef = makeRef(opts.tabs);
  const activeTabIdRef = makeRef(opts.activeTabId);
  const setTabNotebookIdMock = vi.fn();

  // Start with mismatched projectId so auto-effects don't fire
  useNotebookStore.setState({ currentProjectId: '__disabled__' });

  const hookResult = renderHook(() =>
    useTabNotebookSync({
      projectId: opts.projectId ?? 'proj-1',
      tabsReady: true,
      tabsRef,
      activeTabIdRef,
      tabs: opts.tabs,
      activeTab: undefined, // disables ensure-notebook auto-effect
      setTabNotebookId: setTabNotebookIdMock
    })
  );

  return { ...hookResult, setTabNotebookIdMock, tabsRef, activeTabIdRef };
}

/**
 * Enable the hook's functions by setting the correct currentProjectId.
 * Must be called before invoking reconcile/ensure.
 */
function enableStoreForProject(projectId: string, notebooks: Notebook[]) {
  useNotebookStore.setState({
    currentProjectId: projectId,
    notebooks,
    activeNotebookId: notebooks[0]?.notebookId ?? null,
    notebook: notebooks[0] ?? null
  });
}

// ── Tests ─────────────────────────────────────────────────────

describe('useTabNotebookSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotebookStore.getState().reset();
    listNotebooksMock.mockResolvedValue([]);
    listCellsMock.mockResolvedValue([]);
    createNotebookApiMock.mockImplementation(
      async (_pid: string, req: { name?: string; metadata?: unknown }) =>
        makeNotebook({
          notebookId: `nb-new-${Math.random().toString(36).slice(2, 6)}`,
          name: req.name ?? 'Notebook',
          metadata: (req.metadata as Record<string, unknown>) ?? {}
        })
    );
    updateNotebookApiMock.mockImplementation(
      async (id: string, updates: Record<string, unknown>) =>
        makeNotebook({ notebookId: id, ...updates })
    );
    deleteNotebookApiMock.mockResolvedValue({ deletedNotebookId: '', fallbackNotebookId: '' });
  });

  afterEach(() => {
    useNotebookStore.getState().reset();
  });

  // ── ensureNotebookForTab ────────────────────────────────────

  describe('ensureNotebookForTab', () => {
    it('creates a notebook WITH preprocessing metadata when forceCreate is true', async () => {
      const tab = makeTab({ id: 'tab-x', name: 'Processing X', notebookId: null });
      const { result } = renderSyncHook({ tabs: [tab], activeTabId: 'tab-x' });

      enableStoreForProject('proj-1', []);

      let notebookId: string | null = null;
      await act(async () => {
        notebookId = await result.current.ensureNotebookForTab(tab, { forceCreate: true });
      });

      expect(notebookId).toBeTruthy();
      expect(createNotebookApiMock).toHaveBeenCalled();

      // Verify the API was called with correct metadata
      const createCall = createNotebookApiMock.mock.calls[0];
      expect(createCall[1]).toEqual({
        name: 'Processing X',
        metadata: {
          phase: 'preprocessing',
          tabId: 'tab-x',
          tabName: 'Processing X'
        }
      });
    });

    it('adopts an unassigned notebook and sets preprocessing metadata', async () => {
      const orphan = makeNotebook({
        notebookId: 'nb-orphan',
        name: 'Old Name',
        metadata: {} // no phase metadata — the bug scenario
      });
      const tab = makeTab({ id: 'tab-adopt', name: 'Processing 1', notebookId: null });
      const { result, setTabNotebookIdMock } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-adopt'
      });

      enableStoreForProject('proj-1', [orphan]);
      listNotebooksMock.mockResolvedValue([orphan]);

      await act(async () => {
        await result.current.ensureNotebookForTab(tab);
      });

      // Should have adopted the orphan
      expect(setTabNotebookIdMock).toHaveBeenCalledWith('tab-adopt', 'nb-orphan');

      // Should have set metadata via PATCH
      expect(updateNotebookApiMock).toHaveBeenCalledWith('nb-orphan', {
        metadata: { phase: 'preprocessing', tabId: 'tab-adopt', tabName: 'Processing 1' }
      });
    });

    it('re-adopts the existing preprocessing notebook for a remounted tab before creating a new one', async () => {
      const remountedNotebook = makeNotebook({
        notebookId: 'nb-remount',
        name: 'Workbook 1',
        metadata: { phase: 'preprocessing', tabId: 'tab-remount', tabName: 'Workbook 1' }
      });
      const tab = makeTab({ id: 'tab-remount', name: 'Workbook 1', notebookId: null });
      const { result, setTabNotebookIdMock } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-remount'
      });

      enableStoreForProject('proj-1', [remountedNotebook]);
      listNotebooksMock.mockResolvedValue([remountedNotebook]);

      let notebookId = null;
      await act(async () => {
        notebookId = await result.current.ensureNotebookForTab(tab);
      });

      expect(notebookId).toBe('nb-remount');
      expect(setTabNotebookIdMock).toHaveBeenCalledWith('tab-remount', 'nb-remount');
      expect(createNotebookApiMock).not.toHaveBeenCalled();
    });

    it('returns existing notebookId when tab already has a valid binding', async () => {
      const nb = makeNotebook({
        notebookId: 'nb-existing',
        kind: 'phase',
        metadata: { phase: 'preprocessing', tabId: 'tab-bound', tabName: 'P1' }
      });
      const tab = makeTab({ id: 'tab-bound', name: 'P1', notebookId: 'nb-existing' });

      // Set up API mock BEFORE enabling store, because changing currentProjectId
      // triggers the auto-reconciliation effect which calls listNotebooks.
      listNotebooksMock.mockResolvedValue([nb]);

      const { result, tabsRef } = renderSyncHook({ tabs: [tab], activeTabId: 'tab-bound' });
      tabsRef.current = [tab];

      enableStoreForProject('proj-1', [nb]);

      let notebookId: string | null = null;
      await act(async () => {
        notebookId = await result.current.ensureNotebookForTab(tab);
      });

      expect(notebookId).toBe('nb-existing');
      expect(createNotebookApiMock).not.toHaveBeenCalled();
    });

    it('does not clear or recreate a valid notebook binding for an inactive tab', async () => {
      const visibleNotebook = makeNotebook({
        notebookId: 'nb-visible',
        kind: 'phase',
        metadata: { phase: 'preprocessing', tabId: 'tab-visible', tabName: 'Visible' }
      });
      const backgroundNotebook = makeNotebook({
        notebookId: 'nb-background',
        kind: 'phase',
        metadata: { phase: 'preprocessing', tabId: 'tab-background', tabName: 'Background' }
      });
      const visibleTab = makeTab({ id: 'tab-visible', name: 'Visible', notebookId: 'nb-visible' });
      const backgroundTab = makeTab({ id: 'tab-background', name: 'Background', notebookId: 'nb-background' });
      const { result, setTabNotebookIdMock, tabsRef, activeTabIdRef } = renderSyncHook({
        tabs: [visibleTab, backgroundTab],
        activeTabId: 'tab-visible'
      });
      tabsRef.current = [visibleTab, backgroundTab];
      activeTabIdRef.current = 'tab-visible';

      enableStoreForProject('proj-1', [visibleNotebook, backgroundNotebook]);
      listNotebooksMock.mockResolvedValue([visibleNotebook, backgroundNotebook]);

      let notebookId: string | null = null;
      await act(async () => {
        notebookId = await result.current.ensureNotebookForTab(backgroundTab);
      });

      expect(notebookId).toBe('nb-background');
      expect(setTabNotebookIdMock).not.toHaveBeenCalledWith('tab-background', null);
      expect(createNotebookApiMock).not.toHaveBeenCalled();
      expect(useNotebookStore.getState().activeNotebookId).toBe('nb-visible');
    });

    it('restores the visible notebook after creating one for an inactive tab', async () => {
      const visibleNotebook = makeNotebook({
        notebookId: 'nb-visible',
        kind: 'phase',
        metadata: { phase: 'preprocessing', tabId: 'tab-visible', tabName: 'Visible' }
      });
      const visibleTab = makeTab({ id: 'tab-visible', name: 'Visible', notebookId: 'nb-visible' });
      const backgroundTab = makeTab({ id: 'tab-background', name: 'Background', notebookId: null });
      const { result, tabsRef, activeTabIdRef } = renderSyncHook({
        tabs: [visibleTab, backgroundTab],
        activeTabId: 'tab-visible'
      });
      tabsRef.current = [visibleTab, backgroundTab];
      activeTabIdRef.current = 'tab-visible';

      enableStoreForProject('proj-1', [visibleNotebook]);
      listNotebooksMock.mockResolvedValue([visibleNotebook]);

      let notebookId: string | null = null;
      await act(async () => {
        notebookId = await result.current.ensureNotebookForTab(backgroundTab, { forceCreate: true });
      });

      expect(notebookId).toBeTruthy();
      expect(createNotebookApiMock).toHaveBeenCalled();
      expect(useNotebookStore.getState().activeNotebookId).toBe('nb-visible');
    });

    it('clears stale binding and creates new notebook when bound notebook is gone', async () => {
      // Tab thinks it has nb-gone, but that notebook doesn't exist
      const tab = makeTab({ id: 'tab-stale', name: 'Processing 1', notebookId: 'nb-gone' });
      const { result, setTabNotebookIdMock, tabsRef } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-stale'
      });
      tabsRef.current = [tab];

      enableStoreForProject('proj-1', []); // nb-gone doesn't exist in store
      listNotebooksMock.mockResolvedValue([]); // nor in API

      await act(async () => {
        await result.current.ensureNotebookForTab(tab);
      });

      // Should have cleared the stale binding
      expect(setTabNotebookIdMock).toHaveBeenCalledWith('tab-stale', null);
      // Should have created a new notebook
      expect(createNotebookApiMock).toHaveBeenCalled();
      const createReq = createNotebookApiMock.mock.calls[0][1];
      expect(createReq.metadata).toEqual({
        phase: 'preprocessing',
        tabId: 'tab-stale',
        tabName: 'Processing 1'
      });
    });
  });

  // ── reconcileTabNotebookMappings ────────────────────────────

  describe('reconcileTabNotebookMappings', () => {
    it('does not create or delete duplicate notebooks when auto ensure and auto reconcile fire together', async () => {
      const tab = makeTab({ id: 'tab-auto-race', name: 'Workbook Auto Race', notebookId: null });
      const tabsRef = makeRef<PreprocessingWorkbook[]>([tab]);
      const activeTabIdRef = makeRef('tab-auto-race');
      const setTabNotebookIdMock = vi.fn((tabId: string, notebookId: string | null) => {
        tabsRef.current = tabsRef.current.map((entry) => (
          entry.id === tabId ? { ...entry, notebookId } : entry
        ));
      });

      const deferredNotebook = createDeferred<Notebook>();
      let createdNotebook: Notebook | null = null;

      createNotebookApiMock.mockImplementation(async (_pid: string, req: { name?: string; metadata?: unknown }) => {
        const notebook = makeNotebook({
          notebookId: 'nb-auto-race',
          name: req.name ?? 'Notebook',
          metadata: (req.metadata as Record<string, unknown>) ?? {}
        });
        createdNotebook = notebook;
        return deferredNotebook.promise;
      });

      listNotebooksMock.mockImplementation(async () => (
        createdNotebook ? [createdNotebook] : []
      ));

      enableStoreForProject('proj-1', []);

      renderHook(() =>
        useTabNotebookSync({
          projectId: 'proj-1',
          tabsReady: true,
          tabsRef,
          activeTabIdRef,
          tabs: tabsRef.current,
          activeTab: tabsRef.current[0],
          setTabNotebookId: setTabNotebookIdMock
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        deferredNotebook.resolve(createdNotebook ?? makeNotebook({ notebookId: 'nb-auto-race' }));
        await Promise.resolve();
      });

      await vi.waitFor(() => {
        expect(createNotebookApiMock).toHaveBeenCalledTimes(1);
      });
      expect(deleteNotebookApiMock).not.toHaveBeenCalled();
    });

    it('does not duplicate notebook creation when reconcile runs during an in-flight ensure', async () => {
      const tab = makeTab({ id: 'tab-race', name: 'Workbook Race', notebookId: null });
      const tabsRef = makeRef<PreprocessingWorkbook[]>([tab]);
      const activeTabIdRef = makeRef('tab-race');
      const setTabNotebookIdMock = vi.fn((tabId: string, notebookId: string | null) => {
        tabsRef.current = tabsRef.current.map((entry) => (
          entry.id === tabId ? { ...entry, notebookId } : entry
        ));
      });

      const deferredNotebook = createDeferred<Notebook>();
      let createdNotebook: Notebook | null = null;

      createNotebookApiMock.mockImplementation(async (_pid: string, req: { name?: string; metadata?: unknown }) => {
        const notebook = makeNotebook({
          notebookId: 'nb-race',
          name: req.name ?? 'Notebook',
          metadata: (req.metadata as Record<string, unknown>) ?? {}
        });
        createdNotebook = notebook;
        return deferredNotebook.promise;
      });

      listNotebooksMock.mockImplementation(async () => (
        createdNotebook ? [createdNotebook] : []
      ));

      enableStoreForProject('proj-1', []);

      const { result, rerender } = renderHook(
        ({ tabsReady }: { tabsReady: boolean }) => useTabNotebookSync({
          projectId: 'proj-1',
          tabsReady,
          tabsRef,
          activeTabIdRef,
          tabs: tabsRef.current,
          activeTab: undefined,
          setTabNotebookId: setTabNotebookIdMock
        }),
        { initialProps: { tabsReady: false } }
      );

      let ensurePromise!: Promise<string | null>;
      await act(async () => {
        ensurePromise = result.current.ensureNotebookForTab(tab);
      });

      rerender({ tabsReady: true });

      let reconcilePromise!: Promise<void>;
      await act(async () => {
        reconcilePromise = result.current.reconcileTabNotebookMappings();
      });

      await act(async () => {
        deferredNotebook.resolve(createdNotebook ?? makeNotebook({ notebookId: 'nb-race' }));
        await ensurePromise;
        await reconcilePromise;
      });

      await vi.waitFor(() => {
        expect(createNotebookApiMock).toHaveBeenCalledTimes(1);
      });
      expect(deleteNotebookApiMock).not.toHaveBeenCalled();
      expect(setTabNotebookIdMock).toHaveBeenCalledWith('tab-race', 'nb-race');
      expect(tabsRef.current[0]?.notebookId).toBe('nb-race');
    });

    it('does not orphan-delete a notebook produced by an in-flight ensure', async () => {
      const tab = makeTab({ id: 'tab-race-delete', name: 'Workbook Delete Guard', notebookId: null });
      const tabsRef = makeRef<PreprocessingWorkbook[]>([tab]);
      const activeTabIdRef = makeRef('tab-race-delete');
      const setTabNotebookIdMock = vi.fn((tabId: string, notebookId: string | null) => {
        tabsRef.current = tabsRef.current.map((entry) => (
          entry.id === tabId ? { ...entry, notebookId } : entry
        ));
      });

      const deferredNotebook = createDeferred<Notebook>();
      let createdNotebook: Notebook | null = null;

      createNotebookApiMock.mockImplementation(async (_pid: string, req: { name?: string; metadata?: unknown }) => {
        const notebook = makeNotebook({
          notebookId: 'nb-race-delete',
          name: req.name ?? 'Notebook',
          metadata: (req.metadata as Record<string, unknown>) ?? {}
        });
        createdNotebook = notebook;
        return deferredNotebook.promise;
      });

      listNotebooksMock.mockImplementation(async () => (
        createdNotebook ? [createdNotebook] : []
      ));

      enableStoreForProject('proj-1', []);

      const { result, rerender } = renderHook(
        ({ tabsReady }: { tabsReady: boolean }) => useTabNotebookSync({
          projectId: 'proj-1',
          tabsReady,
          tabsRef,
          activeTabIdRef,
          tabs: tabsRef.current,
          activeTab: undefined,
          setTabNotebookId: setTabNotebookIdMock
        }),
        { initialProps: { tabsReady: false } }
      );

      let ensurePromise!: Promise<string | null>;
      await act(async () => {
        ensurePromise = result.current.ensureNotebookForTab(tab);
      });

      rerender({ tabsReady: true });

      let reconcilePromise!: Promise<void>;
      await act(async () => {
        reconcilePromise = result.current.reconcileTabNotebookMappings();
      });

      await act(async () => {
        deferredNotebook.resolve(createdNotebook ?? makeNotebook({ notebookId: 'nb-race-delete' }));
        await ensurePromise;
        await reconcilePromise;
      });

      await vi.waitFor(() => {
        expect(tabsRef.current[0]?.notebookId).toBe('nb-race-delete');
      });
      expect(deleteNotebookApiMock).not.toHaveBeenCalledWith('nb-race-delete');
      expect(deleteNotebookApiMock).not.toHaveBeenCalled();
    });

    it('creates notebooks with metadata for tabs that have no notebook', async () => {
      const tab1 = makeTab({ id: 'tab-1', name: 'Processing 1', notebookId: null });
      const tab2 = makeTab({ id: 'tab-2', name: 'Processing 2', notebookId: null });
      const { result } = renderSyncHook({ tabs: [tab1, tab2], activeTabId: 'tab-1' });

      enableStoreForProject('proj-1', []);

      // After each create, append to the returned list
      const created: Notebook[] = [];
      createNotebookApiMock.mockImplementation(
        async (_pid: string, req: { name?: string; metadata?: unknown }) => {
          const nb = makeNotebook({
            notebookId: `nb-c${created.length + 1}`,
            name: req.name ?? 'Notebook',
            metadata: (req.metadata as Record<string, unknown>) ?? {}
          });
          created.push(nb);
          return nb;
        }
      );
      listNotebooksMock.mockImplementation(async () => [...created]);

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      expect(createNotebookApiMock.mock.calls.length).toBeGreaterThanOrEqual(2);

      // EVERY create call must include preprocessing metadata
      for (const call of createNotebookApiMock.mock.calls) {
        const req = call[1];
        expect(req.metadata).toBeDefined();
        expect(req.metadata.phase).toBe('preprocessing');
        expect(req.metadata.tabId).toBeTruthy();
        expect(req.metadata.tabName).toBeTruthy();
      }
    });

    it('adopts unassigned notebooks and sets metadata', async () => {
      const orphan = makeNotebook({
        notebookId: 'nb-orphan',
        name: 'Different Name',
        metadata: {} // empty — the pre-fix state
      });
      const tab = makeTab({ id: 'tab-1', name: 'Processing 1', notebookId: null });
      const { result, setTabNotebookIdMock } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-1'
      });

      enableStoreForProject('proj-1', [orphan]);
      listNotebooksMock.mockResolvedValue([orphan]);

      updateNotebookApiMock.mockImplementation(async (id: string, updates: Record<string, unknown>) => {
        const updated = makeNotebook({
          notebookId: id,
          name: typeof updates.name === 'string' ? updates.name : orphan.name,
          metadata: (updates.metadata as Record<string, unknown>) ?? orphan.metadata
        });
        listNotebooksMock.mockResolvedValue([updated]);
        return updated;
      });

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      expect(setTabNotebookIdMock).toHaveBeenCalledWith('tab-1', 'nb-orphan');

      // Check that updateNotebook was called with metadata
      const metadataCalls = updateNotebookApiMock.mock.calls.filter(
        (call) => {
          const meta = call[1].metadata as Record<string, unknown> | undefined;
          return meta?.phase === 'preprocessing';
        }
      );
      expect(metadataCalls.length).toBeGreaterThan(0);
      expect(metadataCalls[0][1].metadata).toEqual({
        phase: 'preprocessing',
        tabId: 'tab-1',
        tabName: 'Processing 1'
      });
    });

    it('step 2.5: backfills metadata on notebooks with stale/missing phase info', async () => {
      // Tab already has a notebookId binding, but the notebook has empty metadata
      const staleNb = makeNotebook({
        notebookId: 'nb-stale',
        name: 'Processing 1',
        metadata: {} // stale — missing phase
      });
      const tab = makeTab({ id: 'tab-1', name: 'Processing 1', notebookId: 'nb-stale' });
      const { result, tabsRef } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-1'
      });
      tabsRef.current = [tab];

      enableStoreForProject('proj-1', [staleNb]);
      listNotebooksMock.mockResolvedValue([staleNb]);

      const metadataUpdateCalls: Array<[string, Record<string, unknown>]> = [];
      updateNotebookApiMock.mockImplementation(async (id: string, updates: Record<string, unknown>) => {
        metadataUpdateCalls.push([id, updates]);
        const updated = makeNotebook({
          notebookId: id,
          metadata: (updates.metadata as Record<string, unknown>) ?? {}
        });
        listNotebooksMock.mockResolvedValue([updated]);
        return updated;
      });

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      // Step 2.5 should have patched the stale notebook with correct metadata
      const patchedWithPhase = metadataUpdateCalls.filter(
        ([id, updates]) =>
          id === 'nb-stale' &&
          (updates.metadata as Record<string, unknown>)?.phase === 'preprocessing'
      );
      expect(patchedWithPhase.length).toBeGreaterThan(0);
      expect(patchedWithPhase[0][1].metadata).toEqual({
        phase: 'preprocessing',
        tabId: 'tab-1',
        tabName: 'Processing 1'
      });
    });

    it('step 2.5: skips notebooks that already have correct metadata', async () => {
      const goodNb = makeNotebook({
        notebookId: 'nb-good',
        name: 'Processing 1',
        metadata: { phase: 'preprocessing', tabId: 'tab-1', tabName: 'Processing 1' }
      });
      const tab = makeTab({ id: 'tab-1', name: 'Processing 1', notebookId: 'nb-good' });
      const { result, tabsRef } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-1'
      });
      tabsRef.current = [tab];

      enableStoreForProject('proj-1', [goodNb]);
      listNotebooksMock.mockResolvedValue([goodNb]);

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      // Should NOT have called updateNotebook since metadata is already correct
      expect(updateNotebookApiMock).not.toHaveBeenCalled();
    });

    it('clears stale notebookId when bound notebook no longer exists', async () => {
      const tab = makeTab({ id: 'tab-1', name: 'Processing 1', notebookId: 'nb-deleted' });
      const { result, setTabNotebookIdMock, tabsRef } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-1'
      });
      tabsRef.current = [tab];

      enableStoreForProject('proj-1', []);
      listNotebooksMock.mockResolvedValue([]); // notebook doesn't exist

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      // Should have been called — either to clear (null) or to assign a new notebook
      expect(setTabNotebookIdMock).toHaveBeenCalled();
      // A new notebook should have been created since there's nothing to adopt
      expect(createNotebookApiMock).toHaveBeenCalled();
    });

    it('renames adopted notebook when names differ', async () => {
      const orphan = makeNotebook({
        notebookId: 'nb-rename',
        name: 'Notebook 1', // different from tab name
        metadata: {}
      });
      const tab = makeTab({ id: 'tab-r', name: 'Processing 3', notebookId: null });
      const { result } = renderSyncHook({ tabs: [tab], activeTabId: 'tab-r' });

      enableStoreForProject('proj-1', [orphan]);
      listNotebooksMock.mockResolvedValue([orphan]);

      updateNotebookApiMock.mockImplementation(async (id: string, updates: Record<string, unknown>) =>
        makeNotebook({ notebookId: id, name: typeof updates.name === 'string' ? updates.name : orphan.name, metadata: (updates.metadata as Record<string, unknown>) ?? {} })
      );

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      // Should have called updateNotebook with the new name
      const renameCalls = updateNotebookApiMock.mock.calls.filter(
        (call) => call[0] === 'nb-rename' && typeof call[1].name === 'string'
      );
      expect(renameCalls.length).toBeGreaterThan(0);
      expect(renameCalls[0][1].name).toBe('Processing 3');
    });

    it('does nothing when projectId is missing', async () => {
      const tab = makeTab();
      const tabsRef = makeRef([tab]);
      const setTabNotebookIdMock = vi.fn();

      useNotebookStore.setState({ currentProjectId: '__disabled__' });

      const { result } = renderHook(() =>
        useTabNotebookSync({
          projectId: undefined,
          tabsReady: true,
          tabsRef,
          activeTabIdRef: makeRef('tab-1'),
          tabs: [tab],
          activeTab: undefined,
          setTabNotebookId: setTabNotebookIdMock
        })
      );

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      expect(listNotebooksMock).not.toHaveBeenCalled();
      expect(createNotebookApiMock).not.toHaveBeenCalled();
    });

    it('does nothing when tabs are not ready', async () => {
      const tab = makeTab();
      const tabsRef = makeRef([tab]);
      const setTabNotebookIdMock = vi.fn();

      useNotebookStore.setState({ currentProjectId: '__disabled__' });

      const { result } = renderHook(() =>
        useTabNotebookSync({
          projectId: 'proj-1',
          tabsReady: false,
          tabsRef,
          activeTabIdRef: makeRef('tab-1'),
          tabs: [tab],
          activeTab: undefined,
          setTabNotebookId: setTabNotebookIdMock
        })
      );

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      expect(listNotebooksMock).not.toHaveBeenCalled();
    });

    it('does NOT delete a standalone notebook during preprocessing reconcile', async () => {
      // Regression guard: a standalone (exploration) notebook from the data
      // viewer must never be deleted by the preprocessing reconcile loop, even
      // when it has no binding to any preprocessing tab.
      const boundNb = makeNotebook({
        notebookId: 'nb-bound',
        name: 'Processing 1',
        kind: 'phase',
        metadata: { phase: 'preprocessing', tabId: 'tab-1' }
      });
      const standaloneNb = makeNotebook({
        notebookId: 'nb-standalone',
        name: 'Scratch Notebook',
        kind: 'standalone',
        metadata: {}
      });
      const tab = makeTab({ id: 'tab-1', name: 'Processing 1', notebookId: 'nb-bound' });
      const { result, tabsRef } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-1'
      });
      tabsRef.current = [tab];

      enableStoreForProject('proj-1', [boundNb, standaloneNb]);
      listNotebooksMock.mockResolvedValue([boundNb, standaloneNb]);

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      // Standalone notebook must never be deleted.
      expect(deleteNotebookApiMock).not.toHaveBeenCalledWith(
        expect.anything(),
        'nb-standalone'
      );
      // And it must still be present in the store.
      const notebooks = useNotebookStore.getState().notebooks;
      expect(notebooks.some((n) => n.notebookId === 'nb-standalone')).toBe(true);
    });

    it('does NOT adopt a standalone notebook for an unbound tab', async () => {
      // An unassigned tab must create a fresh phase notebook instead of
      // adopting a standalone one, even if the standalone has no binding.
      const standaloneNb = makeNotebook({
        notebookId: 'nb-standalone',
        name: 'Scratch',
        kind: 'standalone',
        metadata: {}
      });
      const tab = makeTab({ id: 'tab-1', name: 'Processing 1', notebookId: null });
      const { result, setTabNotebookIdMock, tabsRef } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-1'
      });
      tabsRef.current = [tab];

      enableStoreForProject('proj-1', [standaloneNb]);
      listNotebooksMock.mockResolvedValue([standaloneNb]);

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      // The standalone's id must never be assigned to the tab.
      expect(setTabNotebookIdMock).not.toHaveBeenCalledWith('tab-1', 'nb-standalone');
      // A new phase notebook should have been created instead.
      expect(createNotebookApiMock).toHaveBeenCalled();
      const createCall = createNotebookApiMock.mock.calls[0];
      expect(createCall[1].metadata).toEqual({
        phase: 'preprocessing',
        tabId: 'tab-1',
        tabName: 'Processing 1'
      });
    });

    it('deletes orphan notebooks not bound to any tab', async () => {
      const boundNb = makeNotebook({
        notebookId: 'nb-bound',
        name: 'Processing 1',
        metadata: { phase: 'preprocessing', tabId: 'tab-1' }
      });
      const orphanNb = makeNotebook({
        notebookId: 'nb-orphan-delete',
        name: 'Stale Notebook',
        metadata: { phase: 'preprocessing', tabId: 'tab-gone' }
      });
      const tab = makeTab({ id: 'tab-1', name: 'Processing 1', notebookId: 'nb-bound' });
      const { result, tabsRef } = renderSyncHook({
        tabs: [tab],
        activeTabId: 'tab-1'
      });
      tabsRef.current = [tab];

      enableStoreForProject('proj-1', [boundNb, orphanNb]);
      listNotebooksMock.mockResolvedValue([boundNb, orphanNb]);

      updateNotebookApiMock.mockImplementation(async (id: string, updates: Record<string, unknown>) =>
        makeNotebook({ notebookId: id, metadata: (updates.metadata as Record<string, unknown>) ?? {} })
      );

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      // The orphan should have been deleted
      expect(deleteNotebookApiMock).toHaveBeenCalled();
    });
  });

  describe('reconcileTabNotebookMappings', () => {
    it('does not delete orphan preprocessing notebooks that still have persisted cells', async () => {
      const orphanNotebook = makeNotebook({
        notebookId: 'nb-with-cells',
        metadata: { phase: 'preprocessing', tabId: 'old-tab', tabName: 'Workbook 1' }
      });
      const activeNotebook = makeNotebook({
        notebookId: 'nb-active',
        metadata: { phase: 'preprocessing', tabId: 'tab-1', tabName: 'Workbook 1' }
      });
      const tab = makeTab({ id: 'tab-1', name: 'Workbook 1', notebookId: 'nb-active' });
      const tabsRef = makeRef([tab]);
      const activeTabIdRef = makeRef('tab-1');
      const setTabNotebookIdMock = vi.fn();

      useNotebookStore.setState({
        currentProjectId: 'proj-1',
        notebooks: [activeNotebook, orphanNotebook],
        activeNotebookId: 'nb-active',
        notebook: activeNotebook
      });

      listNotebooksMock.mockResolvedValue([activeNotebook, orphanNotebook]);
      listCellsMock.mockImplementation(async (notebookId: string) =>
        notebookId === 'nb-with-cells' ? [{ cellId: 'cell-1', position: 0, cellType: 'code' }] : []
      );

      const { result } = renderHook(() =>
        useTabNotebookSync({
          projectId: 'proj-1',
          tabsReady: true,
          tabsRef,
          activeTabIdRef,
          tabs: [tab],
          activeTab: undefined,
          setTabNotebookId: setTabNotebookIdMock
        })
      );

      await act(async () => {
        await result.current.reconcileTabNotebookMappings();
      });

      expect(deleteNotebookApiMock).not.toHaveBeenCalledWith('nb-with-cells');
    });
  });
});

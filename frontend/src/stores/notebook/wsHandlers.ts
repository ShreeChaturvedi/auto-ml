/**
 * Notebook Store — WebSocket Event Handlers
 *
 * Sets up all WebSocket event listeners for the notebook store and returns
 * a cleanup function that unsubscribes every listener.
 */

import type { LockOwner, NotebookCell, WSServerMessage } from '@/types/notebook';
import type { NotebookWSClient } from '@/lib/websocket/notebookClient';

// ============================================================
// Types
// ============================================================

/** Minimal slice of NotebookState the WS handlers need to read. */
interface WSHandlerGetState {
  activeNotebookId: string | null;
  cells: NotebookCell[];
  updateCellLocally: (cell: NotebookCell) => void;
  removeCellLocally: (cellId: string) => void;
  setCellLock: (cellId: string, lockedBy: LockOwner) => void;
  clearCellLock: (cellId: string) => void;
}

/** Partial state shapes the WS handlers write via set(). */
type WSSetState = (
  partial:
    | Partial<{ error: string; isConnected: boolean; isConnecting: boolean }>
    | ((state: { cells: NotebookCell[] }) => { cells: NotebookCell[] })
) => void;

// ============================================================
// Setup
// ============================================================

/**
 * Registers all WebSocket event listeners on `wsClient` using `get`/`set`
 * from the Zustand store. Returns a cleanup function that removes all listeners.
 */
export function setupWSHandlers(
  wsClient: NotebookWSClient,
  get: () => WSHandlerGetState,
  set: WSSetState
): () => void {
  const unsubscribeCellCreated = wsClient.on<WSServerMessage>('cell:created', (msg) => {
    if (msg.type === 'cell:created' && msg.cell.notebookId === get().activeNotebookId) {
      get().updateCellLocally(msg.cell);
    }
  });

  const unsubscribeCellUpdated = wsClient.on<WSServerMessage>('cell:updated', (msg) => {
    if (msg.type === 'cell:updated' && msg.cell.notebookId === get().activeNotebookId) {
      get().updateCellLocally(msg.cell);
    }
  });

  const unsubscribeCellDeleted = wsClient.on<WSServerMessage>('cell:deleted', (msg) => {
    if (msg.type === 'cell:deleted') {
      get().removeCellLocally(msg.cellId);
    }
  });

  const unsubscribeCellLocked = wsClient.on<WSServerMessage>('cell:locked', (msg) => {
    if (msg.type === 'cell:locked') {
      get().setCellLock(msg.cellId, msg.lockedBy as LockOwner);
    }
  });

  const unsubscribeCellUnlocked = wsClient.on<WSServerMessage>('cell:unlocked', (msg) => {
    if (msg.type === 'cell:unlocked') {
      get().clearCellLock(msg.cellId);
    }
  });

  const unsubscribeCellExecuting = wsClient.on<WSServerMessage>('cell:executing', (msg) => {
    if (msg.type === 'cell:executing') {
      set((state) => ({
        cells: state.cells.map((cell) =>
          cell.cellId === msg.cellId
            ? { ...cell, executionStatus: 'running' as const, output: [], outputRefs: [] }
            : cell
        )
      }));
    }
  });

  const unsubscribeCellExecuted = wsClient.on<WSServerMessage>('cell:executed', (msg) => {
    if (msg.type === 'cell:executed' && msg.cell.notebookId === get().activeNotebookId) {
      get().updateCellLocally(msg.cell);
    }
  });

  const unsubscribeCellOutput = wsClient.on<WSServerMessage>('cell:output', (msg) => {
    if (msg.type === 'cell:output') {
      const state = get();
      // Only update if this cell belongs to the active notebook's cell list.
      if (state.activeNotebookId && state.cells.some((c) => c.cellId === msg.cellId)) {
        set((prev) => ({
          cells: prev.cells.map((cell) =>
            cell.cellId === msg.cellId
              ? { ...cell, output: [...cell.output, msg.output] }
              : cell
          )
        }));
      }
    }
  });

  const unsubscribeCellsReset = wsClient.on<WSServerMessage>('notebook:cells_reset', (msg) => {
    if (msg.type === 'notebook:cells_reset') {
      // Ensure safe defaults for fields the server may omit on restored cells
      const cells = [...msg.cells]
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          ...c,
          output: (c as Record<string, unknown>).output ?? [],
          outputRefs: (c as Record<string, unknown>).outputRefs ?? [],
          metadata: (c as Record<string, unknown>).metadata ?? {},
          executionCount: (c as Record<string, unknown>).executionCount ?? 0,
          executionStatus: (c as Record<string, unknown>).executionStatus ?? 'idle',
          isDirty: false
        })) as unknown as NotebookCell[];
      set(() => ({ cells }));
    }
  });

  const unsubscribeError = wsClient.on<WSServerMessage>('error', (msg) => {
    if (msg.type === 'error') {
      set({ error: msg.message });
    }
  });

  const unsubscribeConnected = wsClient.on('connected', () => {
    set({ isConnected: true, isConnecting: false });
  });

  const unsubscribeDisconnected = wsClient.on('disconnected', () => {
    set({ isConnected: false });
  });

  return () => {
    unsubscribeCellCreated();
    unsubscribeCellUpdated();
    unsubscribeCellDeleted();
    unsubscribeCellLocked();
    unsubscribeCellUnlocked();
    unsubscribeCellExecuting();
    unsubscribeCellExecuted();
    unsubscribeCellOutput();
    unsubscribeCellsReset();
    unsubscribeError();
    unsubscribeConnected();
    unsubscribeDisconnected();
  };
}

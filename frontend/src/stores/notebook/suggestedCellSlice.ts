/**
 * Notebook Store — Suggested Cell Slice
 *
 * Manages state for LLM-generated "suggested" cells: streaming lifecycle,
 * accept/reject actions, and abort handling.
 */

import { streamSuggestCell, type InsightCodegenContext } from '@/lib/api/insightCodegen';
import type { NotebookSlice, NotebookState } from './types';

// ============================================================
// Suggested Cell slice interface
// ============================================================

export interface SuggestedCellSlice {
  suggestedCellIds: Set<string>;
  streamingCellIds: Set<string>;
  streamErrors: Map<string, string>;
  streamAbortControllers: Map<string, AbortController>;

  startSuggestedCellStream: (notebookId: string, context: InsightCodegenContext) => Promise<void>;
  acceptSuggestedCell: (cellId: string) => void;
  rejectSuggestedCell: (cellId: string) => Promise<void>;
  cancelSuggestedCellStream: (cellId: string) => void;
}

// ============================================================
// Helpers — immutable Set/Map updates for Zustand reactivity
// ============================================================

function finishStream(
  state: NotebookState,
  cellId: string,
  errorMessage?: string,
): Partial<NotebookState> {
  if (!state.streamingCellIds.has(cellId)) return {};

  const nextStreaming = new Set(state.streamingCellIds);
  nextStreaming.delete(cellId);
  const nextControllers = new Map(state.streamAbortControllers);
  nextControllers.delete(cellId);

  const patch: Partial<NotebookState> = {
    streamingCellIds: nextStreaming,
    streamAbortControllers: nextControllers,
  };

  if (errorMessage !== undefined) {
    const nextErrors = new Map(state.streamErrors);
    nextErrors.set(cellId, errorMessage);
    patch.streamErrors = nextErrors;
  }

  return patch;
}

function cleanupCellTracking(state: NotebookState, cellId: string): Partial<NotebookState> {
  const nextSuggested = new Set(state.suggestedCellIds);
  nextSuggested.delete(cellId);
  const nextErrors = new Map(state.streamErrors);
  nextErrors.delete(cellId);
  const nextStreaming = new Set(state.streamingCellIds);
  nextStreaming.delete(cellId);
  const nextControllers = new Map(state.streamAbortControllers);
  nextControllers.delete(cellId);
  return {
    suggestedCellIds: nextSuggested,
    streamingCellIds: nextStreaming,
    streamErrors: nextErrors,
    streamAbortControllers: nextControllers,
  };
}

// ============================================================
// Slice creator
// ============================================================

export const createSuggestedCellSlice: NotebookSlice<SuggestedCellSlice> = (_set, get) => ({
  // --- state ---
  suggestedCellIds: new Set<string>(),
  streamingCellIds: new Set<string>(),
  streamErrors: new Map<string, string>(),
  streamAbortControllers: new Map<string, AbortController>(),

  // --- actions ---

  startSuggestedCellStream: async (notebookId: string, context: InsightCodegenContext) => {
    const abortController = new AbortController();
    let cellId: string | null = null;

    // Buffer tokens and flush on animation frame to avoid per-token array copy + sort
    let tokenBuffer = '';
    let rafHandle: number | null = null;

    const flushTokens = () => {
      rafHandle = null;
      if (!cellId || !tokenBuffer) return;
      const state = get();
      // Guard: if cell was rejected/cancelled, don't re-insert it
      if (!state.suggestedCellIds.has(cellId)) return;
      const cell = state.cells.find((c) => c.cellId === cellId);
      if (cell) {
        state.updateCellLocally({ ...cell, content: cell.content + tokenBuffer });
      }
      tokenBuffer = '';
    };

    try {
      await streamSuggestCell(
        notebookId,
        context,
        (event) => {
          switch (event.type) {
            case 'cell_created': {
              cellId = event.cellId;

              // Insert a cell skeleton directly instead of calling loadCell()
              // to avoid a race where loadCell's async fetch overwrites streamed content.
              const state = get();
              const now = new Date().toISOString();
              state.updateCellLocally({
                cellId,
                notebookId,
                cellType: 'code',
                content: '',
                position: state.cells.length,
                executionCount: 0,
                executionStatus: 'idle',
                isDirty: false,
                output: [],
                outputRefs: [],
                createdAt: now,
                updatedAt: now,
              });

              const nextControllers = new Map(state.streamAbortControllers);
              nextControllers.set(cellId, abortController);
              const nextSuggested = new Set(state.suggestedCellIds);
              nextSuggested.add(cellId);
              const nextStreaming = new Set(state.streamingCellIds);
              nextStreaming.add(cellId);

              _set({
                suggestedCellIds: nextSuggested,
                streamingCellIds: nextStreaming,
                streamAbortControllers: nextControllers,
              });
              break;
            }

            case 'token': {
              if (!cellId) break;
              tokenBuffer += event.content;
              if (rafHandle === null) {
                rafHandle = requestAnimationFrame(flushTokens);
              }
              break;
            }

            case 'done': {
              if (!cellId) break;
              if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
              flushTokens();
              _set(finishStream(get(), cellId));
              break;
            }

            case 'error': {
              if (!cellId) break;
              if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
              flushTokens();
              _set(finishStream(get(), cellId, event.message));
              break;
            }
          }
        },
        abortController.signal,
      );
    } catch (error) {
      // Cancel pending rAF to prevent ghost cell re-insertion after abort
      if (rafHandle !== null) { cancelAnimationFrame(rafHandle); rafHandle = null; }
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (cellId) {
        flushTokens();
        _set(finishStream(get(), cellId, error instanceof Error ? error.message : 'Stream failed'));
      }
    }
  },

  acceptSuggestedCell: (cellId: string) => {
    const state = get();
    if (!state.suggestedCellIds.has(cellId)) return;
    const nextSuggested = new Set(state.suggestedCellIds);
    nextSuggested.delete(cellId);
    const nextErrors = new Map(state.streamErrors);
    nextErrors.delete(cellId);
    _set({ suggestedCellIds: nextSuggested, streamErrors: nextErrors });
  },

  rejectSuggestedCell: async (cellId: string) => {
    // Clean up tracking state first (before async delete), so the cell
    // is no longer treated as suggested even if deleteCell fails.
    const state = get();
    if (!state.suggestedCellIds.has(cellId)) return;
    _set(cleanupCellTracking(state, cellId));
    // Best-effort delete — may fail if cell is still AI-locked on backend
    try {
      await get().deleteCell(cellId);
    } catch {
      // Cell deletion failed (e.g. still locked). The cell will remain
      // in the notebook as a regular cell. Not ideal but not catastrophic.
    }
  },

  cancelSuggestedCellStream: (cellId: string) => {
    const controller = get().streamAbortControllers.get(cellId);
    if (controller) controller.abort();
    // Clean up tracking immediately — don't wait for async reject
    _set(cleanupCellTracking(get(), cellId));
    // Fire-and-forget delete attempt
    get().deleteCell(cellId).catch(() => {/* best-effort */});
  },
});

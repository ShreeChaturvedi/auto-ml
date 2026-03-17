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
  acceptSuggestedCell: (cellId: string) => Promise<void>;
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

    try {
      await streamSuggestCell(
        notebookId,
        context,
        (event) => {
          const state = get();

          switch (event.type) {
            case 'cell_created': {
              cellId = event.cellId;

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

              void state.loadCell(cellId);
              break;
            }

            case 'token': {
              if (!cellId) break;
              const cell = state.cells.find((c) => c.cellId === cellId);
              if (cell) {
                state.updateCellLocally({ ...cell, content: cell.content + event.content });
              }
              break;
            }

            case 'done': {
              if (!cellId) break;
              _set(finishStream(get(), cellId));
              break;
            }

            case 'error': {
              if (!cellId) break;
              _set(finishStream(get(), cellId, event.message));
              break;
            }
          }
        },
        abortController.signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (cellId) {
        _set(finishStream(get(), cellId, error instanceof Error ? error.message : 'Stream failed'));
      }
    }
  },

  acceptSuggestedCell: async (cellId: string) => {
    const nextSuggested = new Set(get().suggestedCellIds);
    nextSuggested.delete(cellId);
    const nextErrors = new Map(get().streamErrors);
    nextErrors.delete(cellId);
    _set({ suggestedCellIds: nextSuggested, streamErrors: nextErrors });
  },

  rejectSuggestedCell: async (cellId: string) => {
    await get().deleteCell(cellId);
    _set(cleanupCellTracking(get(), cellId));
  },

  cancelSuggestedCellStream: (cellId: string) => {
    const controller = get().streamAbortControllers.get(cellId);
    if (controller) controller.abort();
    void get().rejectSuggestedCell(cellId);
  },
});

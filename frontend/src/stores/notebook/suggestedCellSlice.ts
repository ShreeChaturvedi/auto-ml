/**
 * Notebook Store — Suggested Cell Slice
 *
 * Manages state for LLM-generated "suggested" cells: streaming lifecycle,
 * accept/reject actions, and abort handling.
 */

import { streamSuggestCell, type InsightCodegenContext } from '@/lib/api/insightCodegen';
import type { NotebookSlice } from './types';

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

              // Register abort controller keyed by cellId
              const nextControllers = new Map(state.streamAbortControllers);
              nextControllers.set(cellId, abortController);

              // Add to suggested + streaming sets
              const nextSuggested = new Set(state.suggestedCellIds);
              nextSuggested.add(cellId);
              const nextStreaming = new Set(state.streamingCellIds);
              nextStreaming.add(cellId);

              _set({
                suggestedCellIds: nextSuggested,
                streamingCellIds: nextStreaming,
                streamAbortControllers: nextControllers,
              });

              // Load the cell from the backend so it appears in the cells array
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
              const nextStreaming = new Set(get().streamingCellIds);
              nextStreaming.delete(cellId);
              const nextControllers = new Map(get().streamAbortControllers);
              nextControllers.delete(cellId);
              _set({
                streamingCellIds: nextStreaming,
                streamAbortControllers: nextControllers,
              });
              break;
            }

            case 'error': {
              if (!cellId) break;
              const nextStreaming = new Set(get().streamingCellIds);
              nextStreaming.delete(cellId);
              const nextErrors = new Map(get().streamErrors);
              nextErrors.set(cellId, event.message);
              const nextControllers = new Map(get().streamAbortControllers);
              nextControllers.delete(cellId);
              _set({
                streamingCellIds: nextStreaming,
                streamErrors: nextErrors,
                streamAbortControllers: nextControllers,
              });
              break;
            }
          }
        },
        abortController.signal,
      );
    } catch (error) {
      // AbortError is expected when user cancels — don't surface it
      if (error instanceof DOMException && error.name === 'AbortError') return;

      if (cellId) {
        const nextStreaming = new Set(get().streamingCellIds);
        nextStreaming.delete(cellId);
        const nextErrors = new Map(get().streamErrors);
        nextErrors.set(cellId, error instanceof Error ? error.message : 'Stream failed');
        const nextControllers = new Map(get().streamAbortControllers);
        nextControllers.delete(cellId);
        _set({
          streamingCellIds: nextStreaming,
          streamErrors: nextErrors,
          streamAbortControllers: nextControllers,
        });
      }
    }
  },

  acceptSuggestedCell: async (cellId: string) => {
    const state = get();

    // Persist: remove isSuggested flag by updating metadata
    await state.updateCell(cellId, { metadata: {} });

    // Remove from suggested set
    const nextSuggested = new Set(state.suggestedCellIds);
    nextSuggested.delete(cellId);
    const nextErrors = new Map(state.streamErrors);
    nextErrors.delete(cellId);
    _set({
      suggestedCellIds: nextSuggested,
      streamErrors: nextErrors,
    });
  },

  rejectSuggestedCell: async (cellId: string) => {
    const state = get();

    // Delete the cell from backend + local state
    await state.deleteCell(cellId);

    // Clean up all tracking sets
    const nextSuggested = new Set(state.suggestedCellIds);
    nextSuggested.delete(cellId);
    const nextStreaming = new Set(state.streamingCellIds);
    nextStreaming.delete(cellId);
    const nextErrors = new Map(state.streamErrors);
    nextErrors.delete(cellId);
    const nextControllers = new Map(state.streamAbortControllers);
    nextControllers.delete(cellId);
    _set({
      suggestedCellIds: nextSuggested,
      streamingCellIds: nextStreaming,
      streamErrors: nextErrors,
      streamAbortControllers: nextControllers,
    });
  },

  cancelSuggestedCellStream: (cellId: string) => {
    const state = get();
    const controller = state.streamAbortControllers.get(cellId);
    if (controller) {
      controller.abort();
    }
    // Reject (delete) the cell after aborting
    void state.rejectSuggestedCell(cellId);
  },
});

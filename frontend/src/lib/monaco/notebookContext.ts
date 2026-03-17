/**
 * Notebook Context — Model-to-Cell Registry
 *
 * Maps Monaco model URIs to notebook cell IDs and builds
 * cross-cell context for intellisense providers.
 */

import { useNotebookStore } from '@/stores/notebookStore';
import type { CellContext } from '@/lib/api/notebooks';

// Map Monaco model URI string → cellId
const modelCellMap = new Map<string, string>();

export function registerModelCellId(modelUri: string, cellId: string): void {
  modelCellMap.set(modelUri, cellId);
}

export function unregisterModelCellId(modelUri: string): void {
  modelCellMap.delete(modelUri);
}

export function getCellIdForModel(modelUri: string): string | undefined {
  return modelCellMap.get(modelUri);
}

/**
 * Build notebook context for a given model URI.
 * Returns all code cells sorted by position and the current cell ID.
 */
export function buildNotebookContext(modelUri: string): { cells: CellContext[]; currentCellId: string | undefined } {
  const currentCellId = modelCellMap.get(modelUri);
  const allCells = useNotebookStore.getState().cells;

  const codeCells = allCells
    .filter((c) => c.cellType === 'code')
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      cellId: c.cellId,
      content: c.content,
      position: c.position
    }));

  return { cells: codeCells, currentCellId };
}

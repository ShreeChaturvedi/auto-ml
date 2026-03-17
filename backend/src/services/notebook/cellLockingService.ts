import * as repo from '../../repositories/notebookRepository.js';
import type { Cell, CellOutput, OutputRef } from '../../types/notebook.js';

import { broadcast } from './notebookService.js';

// ============================================================
// Cell Locking
// ============================================================

/**
 * Acquire a lock on a cell for AI operations.
 */
export async function acquireLock(cellId: string, lockedBy: 'ai' | 'user'): Promise<boolean> {
  const acquired = await repo.lockCell(cellId, lockedBy);

  if (acquired) {
    const cell = await repo.getCell(cellId);
    if (cell) {
      broadcast(cell.notebookId, 'cell:locked', { cellId, lockedBy });
    }
  }

  return acquired;
}

/**
 * Release a lock on a cell.
 */
export async function releaseLock(cellId: string): Promise<void> {
  const cell = await repo.getCell(cellId);
  await repo.unlockCell(cellId);

  if (cell) {
    broadcast(cell.notebookId, 'cell:unlocked', { cellId });
  }
}

export async function updateCellMetadata(cellId: string, metadata: Record<string, unknown>): Promise<Cell> {
  const updatedCell = await repo.updateCell(cellId, { metadata });
  broadcast(updatedCell.notebookId, 'cell:updated', { cell: updatedCell });
  return updatedCell;
}

/**
 * Check if a cell is locked.
 */
export async function isLocked(cellId: string): Promise<{ locked: boolean; by?: string }> {
  return repo.getCellLock(cellId);
}

// ============================================================
// Output Management
// ============================================================

/**
 * Process execution outputs, storing large ones externally.
 */
export async function processOutputs(
  cellId: string,
  outputs: CellOutput[]
): Promise<{ inlineOutputs: CellOutput[]; outputRefs: OutputRef[] }> {
  const inlineOutputs: CellOutput[] = [];
  const outputRefs: OutputRef[] = [];

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];

    if (repo.shouldStoreExternally(output.content)) {
      // Store externally
      const filename = `output_${i}_${Date.now()}.${getExtension(output.type)}`;
      const ref = await repo.saveLargeOutput(
        cellId,
        output.type,
        Buffer.from(output.content),
        filename,
        output.mimeType
      );
      outputRefs.push(ref);
    } else {
      // Store inline
      inlineOutputs.push(output);
    }
  }

  return { inlineOutputs, outputRefs };
}

function getExtension(type: string): string {
  switch (type) {
    case 'image':
      return 'png';
    case 'html':
      return 'html';
    case 'table':
      return 'json';
    default:
      return 'txt';
  }
}

/**
 * Get the filesystem path for a cell output.
 */
export function getOutputPath(cellId: string, filename: string): string {
  return repo.getOutputPath(cellId, filename);
}

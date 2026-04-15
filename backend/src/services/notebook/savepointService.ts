import { getDbPool } from '../../db.js';
import type { CellSnapshotItem } from '../../repositories/notebook/savepointCrud.js';
import * as repo from '../../repositories/notebookRepository.js';
import { CELL_EDITOR_AI } from '../../types/notebook.js';

import { broadcast } from './notebookService.js';

// ============================================================
// Types
// ============================================================

export interface SavepointDiff {
  cellsAdded: number;
  cellsModified: number;
  cellsDeleted: number;
  linesAdded: number;
  linesRemoved: number;
  hasManualEdits: boolean;
  details: CellDiffDetail[];
}

export interface CellDiffDetail {
  cellId: string;
  title: string | null;
  changeType: 'added' | 'modified' | 'deleted';
  linesAdded: number;
  linesRemoved: number;
}

// ============================================================
// Helpers
// ============================================================

function countLines(content: string | null | undefined): number {
  const s = (content ?? '').trimEnd();
  return s === '' ? 0 : s.split('\n').length;
}

// ============================================================
// Savepoint Operations
// ============================================================

/**
 * Create a savepoint for the current state of a notebook's cells.
 */
export async function createSavepoint(
  notebookId: string,
  turnIndex: number,
  turnMessageId: string
) {
  return repo.createSavepoint(notebookId, turnIndex, turnMessageId);
}

/**
 * Compute a diff between a savepoint's snapshot and the current notebook cells.
 */
export async function computeDiff(savepointId: string): Promise<SavepointDiff> {
  const savepoint = await repo.getSavepoint(savepointId);
  if (!savepoint) {
    throw new Error(`Savepoint not found: ${savepointId}`);
  }

  const snapshot = savepoint.cells_snapshot;
  const currentCells = await repo.getCellsByNotebook(savepoint.notebook_id);

  // Build lookup maps by cellId
  const snapshotMap = new Map<string, CellSnapshotItem>();
  for (const item of snapshot) {
    snapshotMap.set(item.cellId, item);
  }

  const currentMap = new Map<string, typeof currentCells[number]>();
  for (const cell of currentCells) {
    currentMap.set(cell.cellId, cell);
  }

  const details: CellDiffDetail[] = [];
  let cellsAdded = 0;
  let cellsModified = 0;
  let cellsDeleted = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let hasManualEdits = false;

  // Cells in current but not in snapshot => added
  for (const cell of currentCells) {
    if (!snapshotMap.has(cell.cellId)) {
      const lines = countLines(cell.content);
      cellsAdded++;
      totalLinesAdded += lines;
      details.push({
        cellId: cell.cellId,
        title: cell.title ?? null,
        changeType: 'added',
        linesAdded: lines,
        linesRemoved: 0
      });
    }
  }

  // Cells in both => check for modifications
  snapshot.forEach((snapshotItem) => {
    const currentCell = currentMap.get(snapshotItem.cellId);
    if (currentCell) {
      if (currentCell.content !== snapshotItem.content) {
        const oldLines = countLines(snapshotItem.content);
        const newLines = countLines(currentCell.content);
        const linesAdded = Math.max(0, newLines - oldLines);
        const linesRemoved = Math.max(0, oldLines - newLines);

        cellsModified++;
        totalLinesAdded += linesAdded;
        totalLinesRemoved += linesRemoved;

        // Check for manual edits
        const metadata = currentCell.metadata as Record<string, unknown> | undefined;
        if (metadata && metadata.lastEditedBy !== CELL_EDITOR_AI) {
          hasManualEdits = true;
        }

        details.push({
          cellId: currentCell.cellId,
          title: currentCell.title ?? null,
          changeType: 'modified',
          linesAdded,
          linesRemoved
        });
      }
    }
  });

  // Cells in snapshot but not in current => deleted
  snapshot.forEach((snapshotItem) => {
    if (!currentMap.has(snapshotItem.cellId)) {
      const lines = countLines(snapshotItem.content);
      cellsDeleted++;
      totalLinesRemoved += lines;

      details.push({
        cellId: snapshotItem.cellId,
        title: snapshotItem.title,
        changeType: 'deleted',
        linesAdded: 0,
        linesRemoved: lines
      });
    }
  });

  return {
    cellsAdded,
    cellsModified,
    cellsDeleted,
    linesAdded: totalLinesAdded,
    linesRemoved: totalLinesRemoved,
    hasManualEdits,
    details
  };
}

/**
 * Restore a notebook to the state captured in a savepoint.
 * Uses a raw SQL transaction to atomically replace all cells.
 */
export async function restoreSavepoint(savepointId: string): Promise<{
  cellsRestored: number;
  cellsDeleted: number;
  cellsCreated: number;
  affectedCellIds: string[];
}> {
  const savepoint = await repo.getSavepoint(savepointId);
  if (!savepoint) {
    throw new Error(`Savepoint not found: ${savepointId}`);
  }

  const notebookId = savepoint.notebook_id;
  const snapshot = savepoint.cells_snapshot;

  const pool = getDbPool();
  const client = await pool.connect();
  let cellsDeleted = 0;

  try {
    await client.query('BEGIN');

    // Count + delete current cells inside the transaction to avoid TOCTOU
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cells WHERE notebook_id = $1`,
      [notebookId]
    );
    cellsDeleted = parseInt(countResult.rows[0]?.count ?? '0', 10);

    await client.query(
      `DELETE FROM cells WHERE notebook_id = $1`,
      [notebookId]
    );

    // Bulk insert all snapshot cells in a single query
    if (snapshot.length > 0) {
      const placeholders: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;
      for (const item of snapshot) {
        placeholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6})`);
        values.push(item.cellId, notebookId, item.cellType, item.title, item.content, item.position, JSON.stringify({}));
        paramIdx += 7;
      }
      await client.query(
        `INSERT INTO cells (cell_id, notebook_id, cell_type, title, content, position, metadata)
         VALUES ${placeholders.join(', ')}`,
        values
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Build restored cells for the broadcast
  const restoredCells = snapshot.map((item) => ({
    cellId: item.cellId,
    notebookId,
    cellType: item.cellType,
    title: item.title,
    content: item.content,
    position: item.position,
    metadata: {},
    executionCount: 0,
    executionOrder: null,
    executionStatus: 'idle' as const,
    executionDurationMs: null,
    executedAt: null,
    isDirty: false,
    output: [],
    outputRefs: [],
    lockedBy: null,
    lockedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }));

  // Broadcast the reset event. Include `notebookId` in the payload so
  // clients can reject events for a different notebook tab after a switch.
  broadcast(notebookId, 'notebook:cells_reset', { notebookId, cells: restoredCells });

  const uniqueIds = snapshot.map((item) => item.cellId);

  return {
    cellsRestored: snapshot.length,
    cellsDeleted,
    cellsCreated: snapshot.length,
    affectedCellIds: uniqueIds
  };
}

/**
 * List all savepoints for a notebook.
 */
export async function listSavepoints(notebookId: string) {
  return repo.listSavepoints(notebookId);
}

/**
 * Delete all savepoints for a notebook after the given turn index.
 */
export async function deleteSavepointsAfter(notebookId: string, turnIndex: number) {
  return repo.deleteSavepointsAfter(notebookId, turnIndex);
}

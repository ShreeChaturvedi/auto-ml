import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { getDbPool, hasDatabaseConfiguration } from '../../db.js';
import type {
  Cell,
  CellSummary,
  CellOutput,
  OutputRef,
  CellRow,
  CellType,
  CellStatus
} from '../../types/notebook.js';

import { rowToCell, OUTPUT_DIR } from './helpers.js';

// ============================================================
// Cell Operations
// ============================================================

/**
 * Create a new cell in a notebook.
 */
export async function createCell(
  notebookId: string,
  options: {
    content: string;
    cellType?: CellType;
    title?: string;
    position?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<Cell> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const cellId = randomUUID();
  const cellType = options.cellType ?? 'code';

  // Get the next position if not specified
  let position = options.position;
  if (position === undefined) {
    const maxPosResult = await pool.query<{ max_pos: number | null }>(
      `SELECT MAX(position) as max_pos FROM cells WHERE notebook_id = $1`,
      [notebookId]
    );
    position = (maxPosResult.rows[0]?.max_pos ?? -1) + 1;
  } else {
    // Shift existing cells at or after this position
    await pool.query(
      `UPDATE cells SET position = position + 1 WHERE notebook_id = $1 AND position >= $2`,
      [notebookId, position]
    );
  }

  const result = await pool.query<CellRow>(
    `INSERT INTO cells (cell_id, notebook_id, cell_type, title, content, position, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [cellId, notebookId, cellType, options.title ?? null, options.content, position, options.metadata ?? {}]
  );

  return rowToCell(result.rows[0]);
}

/**
 * Get a single cell by ID.
 */
export async function getCell(cellId: string): Promise<Cell | null> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const result = await pool.query<CellRow>(
    `SELECT * FROM cells WHERE cell_id = $1`,
    [cellId]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  return rowToCell(result.rows[0]);
}

/**
 * Get all cells for a notebook, ordered by position.
 */
export async function getCellsByNotebook(notebookId: string): Promise<Cell[]> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const result = await pool.query<CellRow>(
    `SELECT * FROM cells WHERE notebook_id = $1 ORDER BY position ASC`,
    [notebookId]
  );

  return result.rows.map(rowToCell);
}

/**
 * Get cell summaries for a notebook (lighter weight for list operations).
 */
export async function getCellSummaries(notebookId: string): Promise<CellSummary[]> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const result = await pool.query<CellRow>(
    `SELECT cell_id, cell_type, title, position, execution_status, execution_count, execution_order, is_dirty, locked_by, content
     FROM cells WHERE notebook_id = $1 ORDER BY position ASC`,
    [notebookId]
  );

  return result.rows.map((row) => ({
    cellId: row.cell_id,
    cellType: row.cell_type as CellType,
    title: row.title,
    position: row.position,
    executionStatus: (row.execution_status ?? 'idle') as CellStatus,
    executionCount: row.execution_count ?? 0,
    executionOrder: row.execution_order,
    isDirty: row.is_dirty ?? false,
    lockedBy: row.locked_by,
    contentPreview: row.content?.substring(0, 100) ?? ''
  }));
}

/**
 * Update a cell's content and metadata.
 */
export async function updateCell(
  cellId: string,
  updates: {
    content?: string;
    title?: string;
    cellType?: CellType;
    metadata?: Record<string, unknown>;
    executionStatus?: CellStatus;
    executionCount?: number;
    executionOrder?: number | null;
    executionDurationMs?: number;
    executedAt?: Date | null;
    isDirty?: boolean;
    output?: CellOutput[];
    outputRefs?: OutputRef[];
  }
): Promise<Cell> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const setClauses: string[] = [];
  const values: unknown[] = [cellId];
  let paramIndex = 2;

  if (updates.content !== undefined) {
    setClauses.push(`content = $${paramIndex++}`);
    values.push(updates.content);
    setClauses.push(`is_dirty = CASE WHEN cell_type = 'code' THEN TRUE ELSE is_dirty END`);
  }

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(updates.title);
  }

  if (updates.cellType !== undefined) {
    setClauses.push(`cell_type = $${paramIndex++}`);
    values.push(updates.cellType);
  }

  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (updates.executionStatus !== undefined) {
    setClauses.push(`execution_status = $${paramIndex++}`);
    values.push(updates.executionStatus);
  }

  if (updates.executionCount !== undefined) {
    setClauses.push(`execution_count = $${paramIndex++}`);
    values.push(updates.executionCount);
  }

  if (updates.executionOrder !== undefined) {
    setClauses.push(`execution_order = $${paramIndex++}`);
    values.push(updates.executionOrder);
  }

  if (updates.executionDurationMs !== undefined) {
    setClauses.push(`execution_duration_ms = $${paramIndex++}`);
    values.push(updates.executionDurationMs);
  }

  if (updates.executedAt !== undefined) {
    setClauses.push(`executed_at = $${paramIndex++}`);
    values.push(updates.executedAt);
  }

  if (updates.isDirty !== undefined) {
    setClauses.push(`is_dirty = $${paramIndex++}`);
    values.push(updates.isDirty);
  }

  if (updates.output !== undefined) {
    setClauses.push(`output = $${paramIndex++}`);
    values.push(JSON.stringify(updates.output));
  }

  if (updates.outputRefs !== undefined) {
    setClauses.push(`output_refs = $${paramIndex++}`);
    values.push(JSON.stringify(updates.outputRefs));
  }

  if (setClauses.length === 0) {
    const existing = await getCell(cellId);
    if (!existing) throw new Error('Cell not found');
    return existing;
  }

  const result = await pool.query<CellRow>(
    `UPDATE cells
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE cell_id = $1
     RETURNING *`,
    values
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new Error('Cell not found');
  }

  return rowToCell(result.rows[0]);
}

/**
 * Delete a cell and reorder remaining cells.
 */
export async function deleteCell(cellId: string): Promise<void> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();

  // Get the cell first to know its position and notebook
  const cell = await getCell(cellId);
  if (!cell) return;

  // Delete the cell
  await pool.query(`DELETE FROM cells WHERE cell_id = $1`, [cellId]);

  // Reorder remaining cells
  await pool.query(
    `UPDATE cells SET position = position - 1 WHERE notebook_id = $1 AND position > $2`,
    [cell.notebookId, cell.position]
  );

  // Clean up any output files
  const _outputDir = join(OUTPUT_DIR, cellId);
  void _outputDir; // Cleanup job should handle orphaned output directories
}

/**
 * Reorder cells in a notebook.
 */
export async function reorderCells(notebookId: string, cellIds: string[]): Promise<void> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Update positions for each cell
    for (let i = 0; i < cellIds.length; i++) {
      await client.query(
        `UPDATE cells SET position = $1, updated_at = NOW()
         WHERE cell_id = $2 AND notebook_id = $3`,
        [i, cellIds[i], notebookId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

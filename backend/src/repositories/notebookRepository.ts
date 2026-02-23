import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { env } from '../config.js';
import type {
  Notebook,
  Cell,
  CellSummary,
  CellOutput,
  OutputRef,
  NotebookRow,
  CellRow,
  CellType,
  CellStatus
} from '../types/notebook.js';

// ============================================================
// Configuration
// ============================================================

const OUTPUT_SIZE_THRESHOLD = env.notebookOutputMaxSize ?? 10 * 1024; // 10KB default
const OUTPUT_DIR = env.notebookOutputDir ?? 'storage/outputs';

// ============================================================
// Helper Functions
// ============================================================

function ensureDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function rowToNotebook(row: NotebookRow): Notebook {
  return {
    notebookId: row.notebook_id,
    projectId: row.project_id,
    name: row.name,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToCell(row: CellRow): Cell {
  return {
    cellId: row.cell_id,
    notebookId: row.notebook_id,
    cellType: row.cell_type as CellType,
    title: row.title,
    content: row.content,
    position: row.position,
    executionCount: row.execution_count ?? 0,
    executionStatus: (row.execution_status ?? 'idle') as CellStatus,
    executionDurationMs: row.execution_duration_ms,
    output: row.output ?? [],
    outputRefs: row.output_refs ?? [],
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ============================================================
// Notebook Operations
// ============================================================

/**
 * Get or create a notebook for a project.
 * Since we enforce one notebook per project, this ensures the notebook exists.
 */
export async function ensureNotebook(projectId: string): Promise<Notebook> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();

  // Try to get existing notebook
  const existing = await pool.query<NotebookRow>(
    `SELECT * FROM notebooks WHERE project_id = $1`,
    [projectId]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return rowToNotebook(existing.rows[0]);
  }

  // Create new notebook
  const notebookId = randomUUID();
  const result = await pool.query<NotebookRow>(
    `INSERT INTO notebooks (notebook_id, project_id, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [notebookId, projectId, 'Notebook']
  );

  return rowToNotebook(result.rows[0]);
}

/**
 * Get notebook by ID.
 */
export async function getNotebook(notebookId: string): Promise<Notebook | null> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  const result = await pool.query<NotebookRow>(
    `SELECT * FROM notebooks WHERE notebook_id = $1`,
    [notebookId]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  return rowToNotebook(result.rows[0]);
}

/**
 * Get notebook by project ID.
 */
export async function getNotebookByProject(projectId: string): Promise<Notebook | null> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  const result = await pool.query<NotebookRow>(
    `SELECT * FROM notebooks WHERE project_id = $1`,
    [projectId]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return null;
  }

  return rowToNotebook(result.rows[0]);
}

/**
 * Update notebook metadata.
 */
export async function updateNotebook(
  notebookId: string,
  updates: { name?: string; metadata?: Record<string, unknown> }
): Promise<Notebook> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  const setClauses: string[] = [];
  const values: unknown[] = [notebookId];
  let paramIndex = 2;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }

  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIndex++}`);
    values.push(updates.metadata);
  }

  if (setClauses.length === 0) {
    const existing = await getNotebook(notebookId);
    if (!existing) throw new Error('Notebook not found');
    return existing;
  }

  const result = await pool.query<NotebookRow>(
    `UPDATE notebooks
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE notebook_id = $1
     RETURNING *`,
    values
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new Error('Notebook not found');
  }

  return rowToNotebook(result.rows[0]);
}

/**
 * Delete a notebook and all its cells.
 */
export async function deleteNotebook(notebookId: string): Promise<void> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for notebook operations');
  }

  const pool = getDbPool();
  await pool.query(`DELETE FROM notebooks WHERE notebook_id = $1`, [notebookId]);
}

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
    `INSERT INTO cells (cell_id, notebook_id, cell_type, title, content, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [cellId, notebookId, cellType, options.title ?? null, options.content, position]
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
    `SELECT cell_id, cell_type, title, position, execution_status, execution_count, locked_by, content
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
    executionStatus?: CellStatus;
    executionCount?: number;
    executionDurationMs?: number;
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
  }

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(updates.title);
  }

  if (updates.cellType !== undefined) {
    setClauses.push(`cell_type = $${paramIndex++}`);
    values.push(updates.cellType);
  }

  if (updates.executionStatus !== undefined) {
    setClauses.push(`execution_status = $${paramIndex++}`);
    values.push(updates.executionStatus);
  }

  if (updates.executionCount !== undefined) {
    setClauses.push(`execution_count = $${paramIndex++}`);
    values.push(updates.executionCount);
  }

  if (updates.executionDurationMs !== undefined) {
    setClauses.push(`execution_duration_ms = $${paramIndex++}`);
    values.push(updates.executionDurationMs);
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

// ============================================================
// Cell Locking
// ============================================================

/**
 * Attempt to acquire a lock on a cell.
 * Returns true if lock was acquired, false if already locked.
 */
export async function lockCell(cellId: string, lockedBy: string): Promise<boolean> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();

  // Use conditional update to atomically acquire lock only if not locked
  const result = await pool.query(
    `UPDATE cells
     SET locked_by = $2, locked_at = NOW(), updated_at = NOW()
     WHERE cell_id = $1 AND (locked_by IS NULL OR locked_at < NOW() - INTERVAL '1 minute')
     RETURNING cell_id`,
    [cellId, lockedBy]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Release a lock on a cell.
 */
export async function unlockCell(cellId: string): Promise<void> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  await pool.query(
    `UPDATE cells SET locked_by = NULL, locked_at = NULL, updated_at = NOW() WHERE cell_id = $1`,
    [cellId]
  );
}

/**
 * Check if a cell is locked and by whom.
 */
export async function getCellLock(cellId: string): Promise<{ locked: boolean; by?: string; at?: Date }> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const result = await pool.query<{ locked_by: string | null; locked_at: Date | null }>(
    `SELECT locked_by, locked_at FROM cells WHERE cell_id = $1`,
    [cellId]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return { locked: false };
  }

  const row = result.rows[0];
  if (!row.locked_by) {
    return { locked: false };
  }

  // Check if lock has expired (1 minute timeout)
  const lockAge = row.locked_at ? Date.now() - row.locked_at.getTime() : 0;
  if (lockAge > 60000) {
    return { locked: false };
  }

  return { locked: true, by: row.locked_by, at: row.locked_at ?? undefined };
}

// ============================================================
// Large Output Storage
// ============================================================

/**
 * Save a large output to the filesystem and return a reference.
 */
export async function saveLargeOutput(
  cellId: string,
  outputType: string,
  content: Buffer,
  filename: string,
  mimeType?: string
): Promise<OutputRef> {
  const cellOutputDir = join(OUTPUT_DIR, cellId);
  ensureDirectory(cellOutputDir);

  const filePath = join(cellOutputDir, filename);
  writeFileSync(filePath, content);

  // Also record in database for tracking
  if (hasDatabaseConfiguration()) {
    const pool = getDbPool();
    const outputId = randomUUID();
    await pool.query(
      `INSERT INTO cell_outputs (output_id, cell_id, output_type, file_path, mime_type, byte_size)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [outputId, cellId, outputType, filePath, mimeType ?? null, content.length]
    );
  }

  return {
    type: outputType as 'image' | 'html' | 'file',
    ref: `outputs/${cellId}/${filename}`,
    mimeType,
    byteSize: content.length
  };
}

/**
 * Get the filesystem path for a large output.
 */
export function getOutputPath(cellId: string, filename: string): string {
  return join(OUTPUT_DIR, cellId, filename);
}

/**
 * Check if a cell output should be stored externally based on size.
 */
export function shouldStoreExternally(content: string | Buffer): boolean {
  const size = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.length;
  return size > OUTPUT_SIZE_THRESHOLD;
}

import { getDbPool, hasDatabaseConfiguration } from '../../db.js';
import type {
  Cell,
  CellOutput,
  OutputRef,
  CellRow,
  CellStatus
} from '../../types/notebook.js';

import { rowToCell } from './helpers.js';

// ============================================================
// Cell Execution
// ============================================================

/**
 * Persist execution result and assign notebook-global execution order atomically.
 */
export async function markCellExecuted(
  cellId: string,
  updates: {
    executionStatus: CellStatus;
    executionDurationMs: number;
    output: CellOutput[];
    outputRefs: OutputRef[];
  }
): Promise<Cell> {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Database configuration required for cell operations');
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const lockResult = await client.query<{
      notebook_id: string;
      execution_count: number | null;
    }>(
      `SELECT notebook_id, execution_count
       FROM cells
       WHERE cell_id = $1
       FOR UPDATE`,
      [cellId]
    );

    if (!lockResult.rowCount || lockResult.rowCount === 0) {
      throw new Error('Cell not found');
    }

    const notebookId = lockResult.rows[0].notebook_id;
    const currentExecutionCount = lockResult.rows[0].execution_count ?? 0;

    const counterResult = await client.query<{ execution_counter: number }>(
      `UPDATE notebooks
       SET execution_counter = execution_counter + 1, updated_at = NOW()
       WHERE notebook_id = $1
       RETURNING execution_counter`,
      [notebookId]
    );

    if (!counterResult.rowCount || counterResult.rowCount === 0) {
      throw new Error('Notebook not found');
    }

    const executionOrder = counterResult.rows[0].execution_counter;

    const result = await client.query<CellRow>(
      `UPDATE cells
       SET
         execution_count = $2,
         execution_order = $3,
         execution_status = $4,
         execution_duration_ms = $5,
         executed_at = NOW(),
         is_dirty = FALSE,
         output = $6,
         output_refs = $7,
         updated_at = NOW()
       WHERE cell_id = $1
       RETURNING *`,
      [
        cellId,
        currentExecutionCount + 1,
        executionOrder,
        updates.executionStatus,
        updates.executionDurationMs,
        JSON.stringify(updates.output),
        JSON.stringify(updates.outputRefs)
      ]
    );

    await client.query('COMMIT');
    return rowToCell(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

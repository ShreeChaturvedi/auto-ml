import { env } from '../../config.js';
import type {
  Notebook,
  Cell,
  CellType,
  CellStatus,
  NotebookRow,
  CellRow
} from '../../types/notebook.js';

export const OUTPUT_SIZE_THRESHOLD = env.notebookOutputMaxSize ?? 10 * 1024; // 10KB default
export const OUTPUT_DIR = env.notebookOutputDir ?? 'storage/outputs';

export function rowToNotebook(row: NotebookRow): Notebook {
  return {
    notebookId: row.notebook_id,
    projectId: row.project_id,
    name: row.name,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function rowToCell(row: CellRow): Cell {
  return {
    cellId: row.cell_id,
    notebookId: row.notebook_id,
    cellType: row.cell_type as CellType,
    title: row.title,
    content: row.content,
    position: row.position,
    metadata: row.metadata ?? {},
    executionCount: row.execution_count ?? 0,
    executionOrder: row.execution_order,
    executionStatus: (row.execution_status ?? 'idle') as CellStatus,
    executionDurationMs: row.execution_duration_ms,
    executedAt: row.executed_at,
    isDirty: row.is_dirty ?? false,
    output: row.output ?? [],
    outputRefs: row.output_refs ?? [],
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

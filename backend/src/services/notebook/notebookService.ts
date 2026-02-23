import * as repo from '../../repositories/notebookRepository.js';
import type {
  Notebook,
  Cell,
  CellSummary,
  CellOutput,
  OutputRef,
  WriteCellOptions,
  EditCellOptions,
  EditCellResult,
  InsertCellOptions
} from '../../types/notebook.js';

// WebSocket server will be injected after initialization
let broadcastToNotebook: ((notebookId: string, event: unknown) => void) | null = null;

/**
 * Set the WebSocket broadcast function.
 * Called from index.ts after WebSocket server is initialized.
 */
export function setWebSocketBroadcast(fn: (notebookId: string, event: unknown) => void): void {
  broadcastToNotebook = fn;
}

/**
 * Broadcast a WebSocket event to all clients subscribed to a notebook.
 */
function broadcast(notebookId: string, type: string, data: Record<string, unknown>): void {
  if (broadcastToNotebook) {
    broadcastToNotebook(notebookId, { type, ...data, timestamp: new Date().toISOString() });
  }
}

// ============================================================
// Notebook Operations
// ============================================================

/**
 * Get or create a notebook for a project.
 */
export async function ensureNotebook(projectId: string): Promise<Notebook> {
  return repo.ensureNotebook(projectId);
}

/**
 * Get a notebook by ID.
 */
export async function getNotebook(notebookId: string): Promise<Notebook | null> {
  return repo.getNotebook(notebookId);
}

/**
 * Get a notebook by project ID.
 */
export async function getNotebookByProject(projectId: string): Promise<Notebook | null> {
  return repo.getNotebookByProject(projectId);
}

// ============================================================
// Cell List and Read Operations
// ============================================================

/**
 * List all cells in a notebook with summary information.
 * Used by the list_cells MCP tool.
 */
export async function listCells(notebookId: string): Promise<CellSummary[]> {
  return repo.getCellSummaries(notebookId);
}

/**
 * Read a single cell with full content and outputs.
 * Used by the read_cell MCP tool.
 */
export async function readCell(cellId: string): Promise<Cell> {
  const cell = await repo.getCell(cellId);
  if (!cell) {
    throw new Error(`Cell not found: ${cellId}`);
  }
  return cell;
}

// ============================================================
// Cell Write Operations
// ============================================================

/**
 * Create a new cell or update an existing cell.
 * Used by the write_cell MCP tool.
 */
export async function writeCell(
  notebookId: string,
  options: WriteCellOptions
): Promise<Cell> {
  let cell: Cell;

  if (options.cellId) {
    // Update existing cell
    const existingCell = await repo.getCell(options.cellId);
    if (!existingCell) {
      throw new Error(`Cell not found: ${options.cellId}`);
    }

    // Check if cell is locked by someone else
    const lock = await repo.getCellLock(options.cellId);
    if (lock.locked && lock.by !== 'ai') {
      throw new Error(`Cell is locked by ${lock.by}`);
    }

    cell = await repo.updateCell(options.cellId, {
      content: options.content,
      title: options.title,
      cellType: options.cellType
    });

    broadcast(cell.notebookId, 'cell:updated', { cell });
  } else {
    // Create new cell
    cell = await repo.createCell(notebookId, {
      content: options.content,
      title: options.title,
      cellType: options.cellType ?? 'code'
    });

    broadcast(notebookId, 'cell:created', { cell });
  }

  return cell;
}

/**
 * Edit specific lines in a cell.
 * Used by the edit_cell MCP tool.
 */
export async function editCell(
  cellId: string,
  options: EditCellOptions
): Promise<EditCellResult> {
  const cell = await repo.getCell(cellId);
  if (!cell) {
    throw new Error(`Cell not found: ${cellId}`);
  }

  // Check if cell is locked by someone else
  const lock = await repo.getCellLock(cellId);
  if (lock.locked && lock.by !== 'ai') {
    throw new Error(`Cell is locked by ${lock.by}`);
  }

  const oldContent = cell.content;
  const lines = oldContent.split('\n');

  // Validate line numbers (1-indexed in the API, 0-indexed in the array)
  const startIdx = options.startLine - 1;
  const endIdx = options.endLine - 1;

  if (startIdx < 0 || endIdx < 0) {
    throw new Error('Line numbers must be positive (1-indexed)');
  }

  if (startIdx > endIdx) {
    throw new Error('startLine must be <= endLine');
  }

  if (endIdx >= lines.length) {
    throw new Error(`endLine ${options.endLine} exceeds file length ${lines.length}`);
  }

  // Extract lines being removed and added
  const linesRemoved = lines.slice(startIdx, endIdx + 1);
  const linesAdded = options.newContent.split('\n');

  // Replace the lines
  const newLines = [
    ...lines.slice(0, startIdx),
    ...linesAdded,
    ...lines.slice(endIdx + 1)
  ];

  const newContent = newLines.join('\n');

  // Update the cell
  const updatedCell = await repo.updateCell(cellId, { content: newContent });

  broadcast(updatedCell.notebookId, 'cell:updated', { cell: updatedCell });

  return {
    cell: updatedCell,
    oldContent,
    newContent,
    diff: {
      linesRemoved,
      linesAdded
    }
  };
}

/**
 * Delete a cell.
 * Used by the delete_cell MCP tool.
 */
export async function deleteCell(cellId: string): Promise<void> {
  const cell = await repo.getCell(cellId);
  if (!cell) {
    throw new Error(`Cell not found: ${cellId}`);
  }

  // Check if cell is locked
  const lock = await repo.getCellLock(cellId);
  if (lock.locked) {
    throw new Error(`Cell is locked by ${lock.by}`);
  }

  const notebookId = cell.notebookId;
  await repo.deleteCell(cellId);

  broadcast(notebookId, 'cell:deleted', { cellId });
}

/**
 * Reorder cells in a notebook.
 * Used by the reorder_cells MCP tool.
 */
export async function reorderCells(notebookId: string, cellIds: string[]): Promise<void> {
  // Verify all cells exist and belong to this notebook
  const existingCells = await repo.getCellsByNotebook(notebookId);
  const existingIds = new Set(existingCells.map((c) => c.cellId));

  for (const id of cellIds) {
    if (!existingIds.has(id)) {
      throw new Error(`Cell ${id} not found in notebook`);
    }
  }

  // Check if any cells are locked
  for (const id of cellIds) {
    const lock = await repo.getCellLock(id);
    if (lock.locked) {
      throw new Error(`Cell ${id} is locked by ${lock.by}`);
    }
  }

  await repo.reorderCells(notebookId, cellIds);

  // Get updated cells and broadcast
  const updatedCells = await repo.getCellsByNotebook(notebookId);
  for (const cell of updatedCells) {
    broadcast(notebookId, 'cell:updated', { cell });
  }
}

/**
 * Insert a cell at a specific position.
 * Used by the insert_cell MCP tool.
 */
export async function insertCell(
  notebookId: string,
  options: InsertCellOptions
): Promise<Cell> {
  const cell = await repo.createCell(notebookId, {
    content: options.content,
    title: options.title,
    cellType: options.cellType ?? 'code',
    position: options.position
  });

  broadcast(notebookId, 'cell:created', { cell });

  return cell;
}

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

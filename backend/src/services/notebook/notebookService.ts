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
export function broadcast(notebookId: string, type: string, data: Record<string, unknown>): void {
  if (broadcastToNotebook) {
    broadcastToNotebook(notebookId, { type, ...data, timestamp: new Date().toISOString() });
  }
}

// Re-export all sub-modules for backward compatibility
export {
  ensureNotebook,
  listProjectNotebooks,
  createProjectNotebook,
  renameProjectNotebook,
  updateProjectNotebook,
  deleteProjectNotebook,
  getNotebook,
  getNotebookByProject
} from './notebookCrudService.js';

export {
  listCells,
  readCell,
  writeCell,
  editCell,
  deleteCell,
  reorderCells,
  insertCell
} from './cellService.js';

export {
  acquireLock,
  releaseLock,
  updateCellMetadata,
  isLocked,
  processOutputs,
  getOutputPath
} from './cellLockingService.js';

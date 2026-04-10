/**
 * Thin barrel — re-exports every public symbol from the notebook/ modules
 * so that existing import paths continue to work unchanged.
 */
export {
  // Notebook CRUD
  listNotebooksByProject,
  createNotebook,
  getNotebook,
  getNotebookByProject,
  updateNotebook,
  deleteNotebook,
  // Cell CRUD
  createCell,
  getCell,
  getCellsByNotebook,
  getCellSummaries,
  updateCell,
  deleteCell,
  reorderCells,
  // Cell Locking
  lockCell,
  unlockCell,
  getCellLock,
  // Cell Execution
  markCellExecuted,
  // Output Storage
  saveLargeOutput,
  getOutputPath,
  shouldStoreExternally,
  // Savepoints
  createSavepoint,
  getSavepoint,
  listSavepoints,
  deleteSavepointsAfter
} from './notebook/index.js';

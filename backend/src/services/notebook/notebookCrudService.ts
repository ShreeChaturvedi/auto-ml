import * as repo from '../../repositories/notebookRepository.js';
import type { Notebook } from '../../types/notebook.js';

// ============================================================
// Notebook Operations
// ============================================================

/**
 * Get or create a notebook for a project.
 */
export async function ensureNotebook(projectId: string): Promise<Notebook> {
  const notebooks = await listProjectNotebooks(projectId);
  return notebooks[0];
}

/**
 * List notebooks for a project. Ensures at least one notebook exists.
 */
export async function listProjectNotebooks(projectId: string): Promise<Notebook[]> {
  const notebooks = await repo.listNotebooksByProject(projectId);
  if (notebooks.length > 0) {
    return notebooks;
  }

  const defaultNotebook = await repo.createNotebook(projectId, 'Notebook 1');
  return [defaultNotebook];
}

/**
 * Create a new notebook in a project.
 */
export async function createProjectNotebook(projectId: string, name?: string): Promise<Notebook> {
  return repo.createNotebook(projectId, name);
}

/**
 * Rename an existing notebook.
 */
export async function renameProjectNotebook(notebookId: string, name: string): Promise<Notebook> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Notebook name is required');
  }

  return repo.updateNotebook(notebookId, { name: trimmedName });
}

/**
 * Delete a notebook from a project. Requires at least one notebook to remain.
 */
export async function deleteProjectNotebook(
  projectId: string,
  notebookId: string
): Promise<{ deletedNotebookId: string; fallbackNotebookId: string }> {
  const notebooks = await listProjectNotebooks(projectId);
  const target = notebooks.find((notebook) => notebook.notebookId === notebookId);
  if (!target) {
    throw new Error('Notebook not found');
  }

  if (notebooks.length <= 1) {
    throw new Error('Cannot delete the last notebook');
  }

  await repo.deleteNotebook(notebookId);

  const remaining = notebooks.filter((notebook) => notebook.notebookId !== notebookId);
  const fallbackNotebookId = remaining[0]?.notebookId;
  if (!fallbackNotebookId) {
    throw new Error('No fallback notebook available');
  }

  return {
    deletedNotebookId: notebookId,
    fallbackNotebookId
  };
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
  const notebooks = await listProjectNotebooks(projectId);
  return notebooks[0] ?? null;
}

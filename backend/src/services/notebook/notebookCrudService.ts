import * as repo from '../../repositories/notebookRepository.js';
import type { Notebook, NotebookKind } from '../../types/notebook.js';

// ============================================================
// Notebook Operations
// ============================================================

export interface ListProjectNotebooksOptions {
  kind?: NotebookKind;
}

export interface CreateProjectNotebookOptions {
  name?: string;
  metadata?: Record<string, unknown>;
  kind?: NotebookKind;
}

/**
 * Get or create the default phase notebook for a project. Standalone
 * notebooks are intentionally excluded so LLM tools and phase syncers
 * never resolve to a user-created exploration notebook.
 */
export async function ensureNotebook(projectId: string): Promise<Notebook> {
  return ensureDefaultPhaseNotebook(projectId);
}

/**
 * Ensure at least one phase-kind notebook exists for the project. Creates a
 * default one if the project has none. Called only from `ensureNotebook` —
 * raw list calls no longer auto-create.
 */
async function ensureDefaultPhaseNotebook(projectId: string): Promise<Notebook> {
  const phaseNotebooks = await repo.listNotebooksByProject(projectId, { kind: 'phase' });
  if (phaseNotebooks.length > 0) {
    return phaseNotebooks[0];
  }
  return repo.createNotebook(projectId, { name: 'Notebook 1', kind: 'phase' });
}

/**
 * List notebooks for a project, optionally filtered by kind. Unlike the old
 * behavior, this no longer auto-creates a default notebook; callers that need
 * that guarantee should use `ensureNotebook` instead.
 */
export async function listProjectNotebooks(
  projectId: string,
  options: ListProjectNotebooksOptions = {}
): Promise<Notebook[]> {
  return repo.listNotebooksByProject(projectId, { kind: options.kind });
}

/**
 * Create a new notebook in a project.
 */
export async function createProjectNotebook(
  projectId: string,
  options: CreateProjectNotebookOptions = {}
): Promise<Notebook> {
  return repo.createNotebook(projectId, {
    name: options.name,
    metadata: options.metadata,
    kind: options.kind ?? 'phase'
  });
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
 * Update a notebook's metadata and optionally its name.
 */
export async function updateProjectNotebook(
  notebookId: string,
  updates: { name?: string; metadata?: Record<string, unknown> }
): Promise<Notebook> {
  return repo.updateNotebook(notebookId, updates);
}

/**
 * Delete a notebook from a project.
 *
 * Phase notebooks have a "last notebook" guard: the project must always
 * retain at least one phase notebook for the phase workflows to function.
 * Standalone notebooks have no minimum count — they are user-owned
 * exploration scratch spaces and can be freely deleted.
 */
export async function deleteProjectNotebook(
  projectId: string,
  notebookId: string
): Promise<{ deletedNotebookId: string; fallbackNotebookId: string | null }> {
  const target = await repo.getNotebook(notebookId);
  if (!target || target.projectId !== projectId) {
    throw new Error('Notebook not found');
  }

  if (target.kind === 'phase') {
    const phaseNotebooks = await repo.listNotebooksByProject(projectId, { kind: 'phase' });
    if (phaseNotebooks.length <= 1) {
      throw new Error('Cannot delete the last phase notebook');
    }

    await repo.deleteNotebook(notebookId);

    const remainingPhase = phaseNotebooks.filter((nb) => nb.notebookId !== notebookId);
    const fallbackNotebookId = remainingPhase[0]?.notebookId ?? null;
    return {
      deletedNotebookId: notebookId,
      fallbackNotebookId
    };
  }

  // Standalone: no minimum count, falls back to any remaining standalone or null.
  await repo.deleteNotebook(notebookId);
  const remainingStandalone = await repo.listNotebooksByProject(projectId, { kind: 'standalone' });
  return {
    deletedNotebookId: notebookId,
    fallbackNotebookId: remainingStandalone[0]?.notebookId ?? null
  };
}

/**
 * Get a notebook by ID.
 */
export async function getNotebook(notebookId: string): Promise<Notebook | null> {
  return repo.getNotebook(notebookId);
}

/**
 * Get the first phase notebook for a project, if any.
 */
export async function getNotebookByProject(projectId: string): Promise<Notebook | null> {
  const notebooks = await repo.listNotebooksByProject(projectId, { kind: 'phase' });
  return notebooks[0] ?? null;
}

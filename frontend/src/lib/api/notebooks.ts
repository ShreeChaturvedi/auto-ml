import type {
  Notebook,
  NotebookCell,
  CellSummary,
  CreateNotebookRequest,
  UpdateNotebookRequest,
  DeleteNotebookResponse,
  CreateCellRequest,
  UpdateCellRequest,
  ReorderCellsRequest,
  ExecutionResult
} from '@/types/notebook';
import { apiRequest, getApiBaseUrl } from './client';

// ============================================================
// Notebook Endpoints
// ============================================================

/**
 * Get the default notebook for a project (legacy endpoint).
 */
export async function getNotebook(projectId: string): Promise<Notebook> {
  return apiRequest<Notebook>(`/projects/${projectId}/notebook`);
}

/**
 * List notebooks for a project.
 */
export async function listNotebooks(projectId: string): Promise<Notebook[]> {
  return apiRequest<Notebook[]>(`/projects/${projectId}/notebooks`);
}

/**
 * Create a notebook in a project.
 */
export async function createNotebook(
  projectId: string,
  request: CreateNotebookRequest
): Promise<Notebook> {
  return apiRequest<Notebook>(`/projects/${projectId}/notebooks`, {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

/**
 * Rename a notebook.
 */
export async function updateNotebook(
  notebookId: string,
  request: UpdateNotebookRequest
): Promise<Notebook> {
  return apiRequest<Notebook>(`/notebooks/${notebookId}`, {
    method: 'PATCH',
    body: JSON.stringify(request)
  });
}

/**
 * Delete a notebook from a project.
 */
export async function deleteNotebook(
  projectId: string,
  notebookId: string
): Promise<DeleteNotebookResponse> {
  return apiRequest<DeleteNotebookResponse>(`/projects/${projectId}/notebooks/${notebookId}`, {
    method: 'DELETE'
  });
}

// ============================================================
// Cell List Endpoints
// ============================================================

/**
 * List all cells in a notebook (summary view).
 */
export async function listCells(notebookId: string): Promise<CellSummary[]> {
  return apiRequest<CellSummary[]>(`/notebooks/${notebookId}/cells`);
}

/**
 * Get a single cell with full content.
 */
export async function getCell(cellId: string): Promise<NotebookCell> {
  return apiRequest<NotebookCell>(`/cells/${cellId}`);
}

// ============================================================
// Cell CRUD Endpoints
// ============================================================

/**
 * Create a new cell in a notebook.
 */
export async function createCell(
  notebookId: string,
  request: CreateCellRequest
): Promise<NotebookCell> {
  return apiRequest<NotebookCell>(`/notebooks/${notebookId}/cells`, {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

/**
 * Update a cell's content or title.
 */
export async function updateCell(
  cellId: string,
  request: UpdateCellRequest
): Promise<NotebookCell> {
  return apiRequest<NotebookCell>(`/cells/${cellId}`, {
    method: 'PATCH',
    body: JSON.stringify(request)
  });
}

/**
 * Delete a cell.
 */
export async function deleteCell(cellId: string): Promise<void> {
  return apiRequest<void>(`/cells/${cellId}`, {
    method: 'DELETE'
  });
}

// ============================================================
// Cell Execution Endpoints
// ============================================================

/**
 * Execute a code cell.
 */
export async function runCell(
  cellId: string,
  projectId: string
): Promise<ExecutionResult> {
  return apiRequest<ExecutionResult>(`/cells/${cellId}/run`, {
    method: 'POST',
    body: JSON.stringify({ projectId })
  });
}

// ============================================================
// Kernel Lifecycle Endpoints
// ============================================================

/**
 * Interrupt a running cell's kernel execution.
 */
export async function interruptKernel(
  cellId: string,
  projectId: string
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/cells/${cellId}/interrupt`, {
    method: 'POST',
    body: JSON.stringify({ projectId })
  });
}

/**
 * Restart the Jupyter kernel for a project.
 */
export async function restartKernel(
  projectId: string
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/projects/${projectId}/kernel/restart`, {
    method: 'POST'
  });
}

// ============================================================
// Cell Reordering Endpoints
// ============================================================

/**
 * Reorder cells in a notebook.
 */
export async function reorderCells(
  notebookId: string,
  request: ReorderCellsRequest
): Promise<void> {
  return apiRequest<void>(`/notebooks/${notebookId}/reorder`, {
    method: 'POST',
    body: JSON.stringify(request)
  });
}

// ============================================================
// Cell Lock Endpoints
// ============================================================

/**
 * Check if a cell is locked.
 */
export async function getCellLock(
  cellId: string
): Promise<{ locked: boolean; by?: string }> {
  return apiRequest<{ locked: boolean; by?: string }>(`/cells/${cellId}/lock`);
}

// ============================================================
// Output URL Helpers
// ============================================================

/**
 * Get the URL for a cell output file.
 */
export function getCellOutputUrl(cellId: string, filename: string): string {
  return `${getApiBaseUrl()}/cells/${cellId}/outputs/${encodeURIComponent(filename)}`;
}

/**
 * Parse an output reference to get the URL.
 * Output refs are in format: "outputs/{cellId}/{filename}"
 */
export function parseOutputRefUrl(ref: string): string {
  const match = ref.match(/^outputs\/([^/]+)\/(.+)$/);
  if (!match) {
    console.warn('Invalid output ref format:', ref);
    return ref;
  }
  const [, cellId, filename] = match;
  return getCellOutputUrl(cellId, filename);
}

// ============================================================
// Python Completions
// ============================================================

export interface PythonCompletion {
  name: string;
  type: 'function' | 'class' | 'module' | 'variable' | 'keyword' | 'statement' | 'param' | 'property';
  module?: string;
  signature?: string;
  docstring?: string;
}

/**
 * Get Python code completions using Jedi LSP
 */
export async function getPythonCompletions(
  code: string,
  line: number,
  column: number,
  projectId: string
): Promise<PythonCompletion[]> {
  try {
    const response = await apiRequest<{ completions: PythonCompletion[] }>('/python/completions', {
      method: 'POST',
      body: JSON.stringify({ code, line, column, projectId })
    });
    return response.completions;
  } catch (error) {
    console.warn('[notebooks] Failed to get completions:', error);
    return [];
  }
}

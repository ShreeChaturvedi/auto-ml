import type {
  Notebook,
  NotebookKind,
  NotebookCell,
  CellSummary,
  CreateNotebookRequest,
  UpdateNotebookRequest,
  DeleteNotebookResponse,
  CreateCellRequest,
  UpdateCellRequest,
  ReorderCellsRequest,
  ExecutionResult,
  ExportedDatasetSummary
} from '@/types/notebook';
import { apiRequest, getApiBaseUrl } from './client';

// ============================================================
// Notebook Endpoints
// ============================================================

export interface ListNotebooksOptions {
  kind?: NotebookKind;
}

/**
 * List notebooks for a project, optionally filtered by kind.
 */
export async function listNotebooks(
  projectId: string,
  options: ListNotebooksOptions = {}
): Promise<Notebook[]> {
  const query = options.kind ? `?kind=${encodeURIComponent(options.kind)}` : '';
  return apiRequest<Notebook[]>(`/projects/${projectId}/notebooks${query}`);
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
    body: request
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
    body: request
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
    body: request
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
    body: request
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

export interface RunCellResponse extends ExecutionResult {
  /**
   * Datasets created via `save_to_project()` during this cell's execution.
   * Present only for standalone notebook cells. Populated by reading the
   * `_exports/.manifest.json` file written by the Python helper.
   */
  exportedDatasets?: ExportedDatasetSummary[];
}

/**
 * Execute a code cell.
 */
export async function runCell(
  cellId: string,
  projectId: string
): Promise<RunCellResponse> {
  return apiRequest<RunCellResponse>(`/cells/${cellId}/run`, {
    method: 'POST',
    body: { projectId }
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
    body: { projectId }
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
    body: request
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

export interface CellContext {
  cellId: string;
  content: string;
  position: number;
}

export interface HoverResult {
  name: string;
  type: string;
  docstring: string;
  fullName?: string;
}

export interface SignatureResult {
  name: string;
  docstring: string;
  params: { name: string; description: string; default?: string }[];
  activeParam: number;
}

export interface DiagnosticResult {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error';
}

/**
 * Get Python code completions using Jedi LSP
 */
export async function getPythonCompletions(
  code: string,
  line: number,
  column: number,
  projectId: string,
  cells?: CellContext[],
  currentCellId?: string
): Promise<PythonCompletion[]> {
  try {
    const response = await apiRequest<{ completions: PythonCompletion[] }>('/python/completions', {
      method: 'POST',
      body: { code, line, column, projectId, ...(cells && { cells }), ...(currentCellId && { currentCellId }) }
    });
    return response.completions;
  } catch (error) {
    console.warn('[notebooks] Failed to get completions:', error);
    return [];
  }
}

/**
 * Get Python hover information using Jedi LSP
 */
export async function getPythonHover(
  code: string,
  line: number,
  column: number,
  projectId: string,
  cells?: CellContext[],
  currentCellId?: string
): Promise<HoverResult | null> {
  try {
    const response = await apiRequest<{ hover: HoverResult }>('/python/hover', {
      method: 'POST',
      body: { code, line, column, projectId, ...(cells && { cells }), ...(currentCellId && { currentCellId }) }
    });
    return response.hover;
  } catch (error) {
    console.warn('[notebooks] Failed to get hover:', error);
    return null;
  }
}

/**
 * Get Python signature help using Jedi LSP
 */
export async function getPythonSignatures(
  code: string,
  line: number,
  column: number,
  projectId: string,
  cells?: CellContext[],
  currentCellId?: string
): Promise<SignatureResult[]> {
  try {
    const response = await apiRequest<{ signatures: SignatureResult[] }>('/python/signatures', {
      method: 'POST',
      body: { code, line, column, projectId, ...(cells && { cells }), ...(currentCellId && { currentCellId }) }
    });
    return response.signatures;
  } catch (error) {
    console.warn('[notebooks] Failed to get signatures:', error);
    return [];
  }
}

/**
 * Get Python diagnostics using Jedi LSP
 */
export async function getPythonDiagnostics(
  code: string,
  line: number,
  column: number,
  projectId: string,
  cells?: CellContext[],
  currentCellId?: string
): Promise<DiagnosticResult[]> {
  try {
    const response = await apiRequest<{ diagnostics: DiagnosticResult[] }>('/python/diagnostics', {
      method: 'POST',
      body: { code, line, column, projectId, ...(cells && { cells }), ...(currentCellId && { currentCellId }) }
    });
    return response.diagnostics;
  } catch (error) {
    console.warn('[notebooks] Failed to get diagnostics:', error);
    return [];
  }
}

/**
 * Cell Tool Handlers - implementations for notebook cell-related tool calls
 */

import { hasDatabaseConfiguration } from '../../../db.js';
import type { ToolCall } from '../../../types/llm.js';
import type { Cell, CellType, Notebook } from '../../../types/notebook.js';
import { executeCell } from '../../notebook/cellExecutionService.js';
import type { DatasetSyncMode } from '../../notebook/datasetSyncMode.js';
import * as notebookService from '../../notebook/notebookService.js';

/**
 * Load the cell and verify it belongs to a phase notebook owned by the given
 * project. Protects against LLM-supplied cellIds that reference cells in
 * other projects or in user-owned standalone scratch notebooks.
 */
async function resolveAndValidateCell(
  projectId: string,
  cellId: string
): Promise<{ cell: Cell; notebook: Notebook }> {
  const cell = await notebookService.readCell(cellId);
  if (!cell) {
    throw new Error(`Cell ${cellId} not found`);
  }
  const notebook = await notebookService.getNotebook(cell.notebookId);
  if (!notebook) {
    throw new Error(`Notebook ${cell.notebookId} not found`);
  }
  if (notebook.projectId !== projectId) {
    throw new Error(`Cell ${cellId} belongs to a different project`);
  }
  if (notebook.kind !== 'phase') {
    throw new Error('LLM tools cannot operate on standalone notebooks');
  }
  return { cell, notebook };
}

async function resolveNotebookId(projectId: string, args: ToolCall['args']): Promise<string> {
  const requestedNotebookId = typeof args?.notebookId === 'string' ? args.notebookId : '';
  if (!requestedNotebookId) {
    // Always resolve to a phase notebook when unspecified. Standalone notebooks
    // are user-owned exploration scratch spaces and must never receive LLM
    // tool output implicitly.
    const notebook = await notebookService.ensureNotebook(projectId);
    return notebook.notebookId;
  }

  // Restrict LLM tool dispatch to phase notebooks only. Standalone notebooks
  // cannot receive LLM cell writes even when referenced by ID.
  const phaseNotebooks = await notebookService.listProjectNotebooks(projectId, { kind: 'phase' });
  const notebookExists = phaseNotebooks.some((notebook) => notebook.notebookId === requestedNotebookId);
  if (!notebookExists) {
    throw new Error(`Notebook ${requestedNotebookId} not found in project`);
  }

  return requestedNotebookId;
}

export async function listCells(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const notebookId = await resolveNotebookId(projectId, args);
  const cells = await notebookService.listCells(notebookId);
  return { notebookId, cells };
}

export async function readCell(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const cellId = typeof args?.cellId === 'string' ? args.cellId : '';
  if (!cellId) {
    throw new Error('cellId is required');
  }
  const { cell } = await resolveAndValidateCell(projectId, cellId);
  return cell;
}

export async function writeCell(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const content = typeof args?.content === 'string' ? args.content : '';
  if (!content) {
    throw new Error('content is required');
  }

  const metadata = parseCellMetadataArg(args?.metadata);
  const notebookId = await resolveNotebookId(projectId, args);
  const cell = await notebookService.writeCell(notebookId, {
    cellId: typeof args?.cellId === 'string' ? args.cellId : undefined,
    title: typeof args?.title === 'string' ? args.title : undefined,
    content,
    cellType: (args?.cellType as CellType) ?? 'code',
    metadata
  });

  return cell;
}

export async function editCell(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const cellId = typeof args?.cellId === 'string' ? args.cellId : '';
  if (!cellId) {
    throw new Error('cellId is required');
  }

  const metadata = parseCellMetadataArg(args?.metadata);
  const startLine = typeof args?.startLine === 'number' ? args.startLine : 0;
  const endLine = typeof args?.endLine === 'number' ? args.endLine : 0;
  const newContent = typeof args?.newContent === 'string' ? args.newContent : '';

  if (startLine < 1 || endLine < 1) {
    throw new Error('startLine and endLine must be positive (1-indexed)');
  }

  await resolveAndValidateCell(projectId, cellId);

  const result = await notebookService.editCell(cellId, {
    startLine,
    endLine,
    newContent,
    metadata
  });

  return result;
}

export async function runCell(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const cellId = typeof args?.cellId === 'string' ? args.cellId : '';
  if (!cellId) {
    throw new Error('cellId is required');
  }

  await resolveAndValidateCell(projectId, cellId);

  const parsedMetadata = parseCellMetadataArg(args?.metadata);
  const datasetSyncMode = extractDatasetSyncMode(parsedMetadata);
  const metadata = stripDatasetSyncMode(parsedMetadata);
  if (metadata && Object.keys(metadata).length > 0) {
    await notebookService.updateCellMetadata(cellId, metadata);
  }

  const result = await executeCell(cellId, projectId, {
    datasetSyncMode
  });
  return result;
}

function parseCellMetadataArg(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function extractDatasetSyncMode(metadata: Record<string, unknown> | undefined): DatasetSyncMode | undefined {
  const preprocessing = metadata?.preprocessing;
  if (!preprocessing || typeof preprocessing !== 'object' || Array.isArray(preprocessing)) {
    return undefined;
  }

  const mode = (preprocessing as Record<string, unknown>).datasetContinuityMode;
  if (mode === 'continue' || mode === 'restart_from_original') {
    return mode;
  }
  return undefined;
}

function stripDatasetSyncMode(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  const preprocessing = metadata.preprocessing;
  if (!preprocessing || typeof preprocessing !== 'object' || Array.isArray(preprocessing)) {
    return metadata;
  }

  const nextPreprocessing = { ...(preprocessing as Record<string, unknown>) };
  delete nextPreprocessing.datasetContinuityMode;

  return {
    ...metadata,
    preprocessing: nextPreprocessing
  };
}

// RFC 4122 v4 UUID (also accepts other v1-v5 variants). Rejects the nil
// UUID "00000000-0000-0000-0000-000000000000" because it's almost always
// an LLM-invented fallback rather than a real cell reference.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function deleteCell(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const cellId = typeof args?.cellId === 'string' ? args.cellId : '';
  if (!cellId) {
    throw new Error('cellId is required');
  }
  // Reject null UUID and malformed strings — the LLM occasionally hallucinates
  // "00000000-0000-0000-0000-000000000000" as a fallback cellId when it has
  // no valid reference in context. A downstream "Cell not found" error is
  // less informative than a clear validation rejection.
  if (cellId === NIL_UUID || !UUID_REGEX.test(cellId)) {
    throw new Error(
      `Invalid cellId "${cellId}". Expected a valid UUID. Call list_cells to get the real cellIds for the active notebook before deleting.`
    );
  }

  // resolveAndValidateCell confirms the cell exists, belongs to this project,
  // and lives in a phase notebook (never a user-owned standalone notebook).
  await resolveAndValidateCell(projectId, cellId);

  await notebookService.deleteCell(cellId);
  return { success: true, cellId };
}

export async function reorderCells(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }

  const cellIds = Array.isArray(args?.cellIds) ? args.cellIds : [];
  if (cellIds.length === 0) {
    throw new Error('cellIds array is required');
  }

  // Validate all are strings
  for (const id of cellIds) {
    if (typeof id !== 'string') {
      throw new Error('All cellIds must be strings');
    }
  }

  const notebookId = await resolveNotebookId(projectId, args);
  await notebookService.reorderCells(notebookId, cellIds as string[]);

  return { success: true };
}

export async function insertCell(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }

  const position = typeof args?.position === 'number' ? args.position : 0;
  const content = typeof args?.content === 'string' ? args.content : '';

  if (!content) {
    throw new Error('content is required');
  }

  const notebookId = await resolveNotebookId(projectId, args);
  const cell = await notebookService.insertCell(notebookId, {
    position,
    content,
    title: typeof args?.title === 'string' ? args.title : undefined,
    cellType: (args?.cellType as CellType) ?? 'code'
  });

  return cell;
}

/**
 * Cell Tool Handlers - implementations for notebook cell-related tool calls
 */

import { hasDatabaseConfiguration } from '../../../db.js';
import type { ToolCall } from '../../../types/llm.js';
import type { CellType } from '../../../types/notebook.js';
import { executeCell } from '../../notebook/cellExecutionService.js';
import type { DatasetSyncMode } from '../../notebook/datasetSyncMode.js';
import * as notebookService from '../../notebook/notebookService.js';

async function resolveNotebookId(projectId: string, args: ToolCall['args']): Promise<string> {
  const requestedNotebookId = typeof args?.notebookId === 'string' ? args.notebookId : '';
  if (!requestedNotebookId) {
    const notebook = await notebookService.ensureNotebook(projectId);
    return notebook.notebookId;
  }

  const projectNotebooks = await notebookService.listProjectNotebooks(projectId);
  const notebookExists = projectNotebooks.some((notebook) => notebook.notebookId === requestedNotebookId);
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

export async function readCell(args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const cellId = typeof args?.cellId === 'string' ? args.cellId : '';
  if (!cellId) {
    throw new Error('cellId is required');
  }
  const cell = await notebookService.readCell(cellId);
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

export async function editCell(args: ToolCall['args']) {
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

export async function deleteCell(args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const cellId = typeof args?.cellId === 'string' ? args.cellId : '';
  if (!cellId) {
    throw new Error('cellId is required');
  }

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

import { env } from '../../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../../db.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import type { ToolCall, ToolResult } from '../../types/llm.js';
import type { CellType } from '../../types/notebook.js';
import { searchDocuments } from '../documentSearchService.js';
import { executeCell, getOrEnsureContainer } from '../notebook/cellExecutionService.js';
import type { DatasetSyncMode } from '../notebook/datasetSyncMode.js';
import * as notebookService from '../notebook/notebookService.js';
import { installPackage, listPackages, uninstallPackage } from '../packageManager.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

type ToolHandler = (projectId: string, args: ToolCall['args']) => Promise<unknown>;

const toolHandlers = new Map<string, ToolHandler>([
  // Data tools
  ['list_project_files', (projectId) => listProjectFiles(projectId)],
  ['get_dataset_profile', (_projectId, args) => getDatasetProfile(args)],
  ['get_dataset_sample', (_projectId, args) => getDatasetSample(args)],
  ['search_documents', (projectId, args) => searchProjectDocuments(projectId, args)],

  // Cell tools
  ['list_cells', (projectId, args) => listCells(projectId, args)],
  ['read_cell', (_projectId, args) => readCell(args)],
  ['write_cell', (projectId, args) => writeCell(projectId, args)],
  ['edit_cell', (_projectId, args) => editCell(args)],
  ['run_cell', (projectId, args) => runCell(projectId, args)],
  ['delete_cell', (_projectId, args) => deleteCell(args)],
  ['reorder_cells', (projectId, args) => reorderCells(projectId, args)],
  ['insert_cell', (projectId, args) => insertCell(projectId, args)],

  // User interaction tools
  ['ask_user', () => Promise.resolve({ type: 'user_interaction', message: 'Awaiting user response' })],
  ['plan_exit', () => Promise.resolve({ type: 'plan_artifact', message: 'Plan finalized by model' })],

  // Package management tools
  ['install_package', (projectId, args) => handleInstallPackage(projectId, args)],
  ['uninstall_package', (projectId, args) => handleUninstallPackage(projectId, args)],
  ['list_packages', (projectId) => handleListPackages(projectId)],
]);

export async function executeToolCall(projectId: string, call: ToolCall): Promise<ToolResult> {
  try {
    const handler = toolHandlers.get(call.tool);
    if (!handler) {
      return { id: call.id, tool: call.tool, output: null, error: 'Unsupported tool' };
    }
    return { id: call.id, tool: call.tool, output: await handler(projectId, call.args) };
  } catch (error) {
    return {
      id: call.id,
      tool: call.tool,
      output: null,
      error: error instanceof Error ? error.message : 'Tool execution failed'
    };
  }
}

async function listProjectFiles(projectId: string) {
  const datasets = (await datasetRepository.list()).filter((dataset) => dataset.projectId === projectId);
  const documents = await listDocuments(projectId);

  return {
    datasets: datasets.map((dataset) => ({
      datasetId: dataset.datasetId,
      filename: dataset.filename,
      nRows: dataset.nRows,
      nCols: dataset.nCols,
      columns: dataset.columns.map((column) => column.name)
    })),
    documents: documents.map((doc) => ({
      documentId: doc.documentId,
      filename: doc.filename,
      mimeType: doc.mimeType
    }))
  };
}

async function listDocuments(projectId: string) {
  if (!hasDatabaseConfiguration()) return [];
  const pool = getDbPool();
  const result = await pool.query(
    `SELECT document_id, filename, mime_type FROM documents WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId]
  );
  return result.rows.map((row) => ({
    documentId: row.document_id,
    filename: row.filename,
    mimeType: row.mime_type
  }));
}

async function getDatasetProfile(args: ToolCall['args']) {
  const datasetRef = typeof args?.datasetId === 'string' ? args.datasetId : '';
  if (!datasetRef) {
    throw new Error('datasetId is required');
  }
  const dataset = await resolveDatasetRef(datasetRef);
  if (!dataset) {
    throw new Error('Dataset not found');
  }
  return dataset;
}

async function getDatasetSample(args: ToolCall['args']) {
  const datasetRef = typeof args?.datasetId === 'string' ? args.datasetId : '';
  if (!datasetRef) {
    throw new Error('datasetId is required');
  }
  const dataset = await resolveDatasetRef(datasetRef);
  if (!dataset) {
    throw new Error('Dataset not found');
  }
  return {
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    sample: dataset.sample
  };
}

async function resolveDatasetRef(datasetRef: string) {
  const datasets = await datasetRepository.list();
  return datasets.find((dataset) =>
    dataset.datasetId === datasetRef || dataset.filename === datasetRef
  );
}

async function searchProjectDocuments(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Document search is unavailable without database configuration.');
  }
  const query = typeof args?.query === 'string' ? args.query : '';
  if (!query.trim()) {
    throw new Error('query is required');
  }
  const limit = Number.isFinite(args?.limit as number) ? Number(args?.limit) : 5;
  const results = await searchDocuments({
    projectId,
    query,
    limit: Math.min(10, Math.max(1, limit))
  });
  return results;
}

// ============================================================
// Cell Tool Handlers
// ============================================================

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

async function listCells(projectId: string, args: ToolCall['args']) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const notebookId = await resolveNotebookId(projectId, args);
  const cells = await notebookService.listCells(notebookId);
  return { notebookId, cells };
}

async function readCell(args: ToolCall['args']) {
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

async function writeCell(projectId: string, args: ToolCall['args']) {
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

async function editCell(args: ToolCall['args']) {
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

async function runCell(projectId: string, args: ToolCall['args']) {
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

async function deleteCell(args: ToolCall['args']) {
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

async function reorderCells(projectId: string, args: ToolCall['args']) {
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

async function insertCell(projectId: string, args: ToolCall['args']) {
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

// ============================================================
// Package Management Tool Handlers
// ============================================================

async function handleInstallPackage(projectId: string, args: ToolCall['args']) {
  const packageName = typeof args?.packageName === 'string' ? args.packageName : '';
  if (!packageName.trim()) {
    throw new Error('packageName is required');
  }

  const container = await getOrEnsureContainer(projectId);
  const result = await installPackage(container, packageName);
  return result;
}

async function handleUninstallPackage(projectId: string, args: ToolCall['args']) {
  const packageName = typeof args?.packageName === 'string' ? args.packageName : '';
  if (!packageName.trim()) {
    throw new Error('packageName is required');
  }

  const container = await getOrEnsureContainer(projectId);
  const result = await uninstallPackage(container, packageName);
  return result;
}

async function handleListPackages(projectId: string) {
  const container = await getOrEnsureContainer(projectId);
  const packages = await listPackages(container);
  return { packages };
}

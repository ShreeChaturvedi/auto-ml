import { getDbPool, hasDatabaseConfiguration } from '../../db.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { env } from '../../config.js';
import { searchDocuments } from '../documentSearchService.js';
import * as notebookService from '../notebook/notebookService.js';
import { executeCell, getOrEnsureContainer } from '../notebook/cellExecutionService.js';
import { installPackage, uninstallPackage, listPackages } from '../containerManager.js';
import type { ToolCall, ToolResult } from '../../types/llm.js';
import type { CellType } from '../../types/notebook.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

export async function executeToolCall(projectId: string, call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.tool) {
      // Data tools
      case 'list_project_files':
        return { id: call.id, tool: call.tool, output: await listProjectFiles(projectId) };
      case 'get_dataset_profile':
        return { id: call.id, tool: call.tool, output: await getDatasetProfile(call.args) };
      case 'get_dataset_sample':
        return { id: call.id, tool: call.tool, output: await getDatasetSample(call.args) };
      case 'search_documents':
        return { id: call.id, tool: call.tool, output: await searchProjectDocuments(projectId, call.args) };

      // Cell tools
      case 'list_cells':
        return { id: call.id, tool: call.tool, output: await listCells(projectId) };
      case 'read_cell':
        return { id: call.id, tool: call.tool, output: await readCell(call.args) };
      case 'write_cell':
        return { id: call.id, tool: call.tool, output: await writeCell(projectId, call.args) };
      case 'edit_cell':
        return { id: call.id, tool: call.tool, output: await editCell(call.args) };
      case 'run_cell':
        return { id: call.id, tool: call.tool, output: await runCell(projectId, call.args) };
      case 'delete_cell':
        return { id: call.id, tool: call.tool, output: await deleteCell(call.args) };
      case 'reorder_cells':
        return { id: call.id, tool: call.tool, output: await reorderCells(projectId, call.args) };
      case 'insert_cell':
        return { id: call.id, tool: call.tool, output: await insertCell(projectId, call.args) };

      // Package management tools
      case 'install_package':
        return { id: call.id, tool: call.tool, output: await handleInstallPackage(projectId, call.args) };
      case 'uninstall_package':
        return { id: call.id, tool: call.tool, output: await handleUninstallPackage(projectId, call.args) };
      case 'list_packages':
        return { id: call.id, tool: call.tool, output: await handleListPackages(projectId) };

      default:
        return { id: call.id, tool: call.tool, output: null, error: 'Unsupported tool' };
    }
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

async function listCells(projectId: string) {
  if (!hasDatabaseConfiguration()) {
    throw new Error('Notebook operations require database configuration.');
  }
  const notebook = await notebookService.ensureNotebook(projectId);
  const cells = await notebookService.listCells(notebook.notebookId);
  return { notebookId: notebook.notebookId, cells };
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

  const notebook = await notebookService.ensureNotebook(projectId);
  const cell = await notebookService.writeCell(notebook.notebookId, {
    cellId: typeof args?.cellId === 'string' ? args.cellId : undefined,
    title: typeof args?.title === 'string' ? args.title : undefined,
    content,
    cellType: (args?.cellType as CellType) ?? 'code'
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

  const startLine = typeof args?.startLine === 'number' ? args.startLine : 0;
  const endLine = typeof args?.endLine === 'number' ? args.endLine : 0;
  const newContent = typeof args?.newContent === 'string' ? args.newContent : '';

  if (startLine < 1 || endLine < 1) {
    throw new Error('startLine and endLine must be positive (1-indexed)');
  }

  const result = await notebookService.editCell(cellId, {
    startLine,
    endLine,
    newContent
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

  const result = await executeCell(cellId, projectId);
  return result;
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

  const notebook = await notebookService.ensureNotebook(projectId);
  await notebookService.reorderCells(notebook.notebookId, cellIds as string[]);

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

  const notebook = await notebookService.ensureNotebook(projectId);
  const cell = await notebookService.insertCell(notebook.notebookId, {
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

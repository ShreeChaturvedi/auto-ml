/**
 * Data Tool Handlers - implementations for data-related tool calls
 */

import { env } from '../../../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../../../db.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import type { ToolCall } from '../../../types/llm.js';
import { searchDocuments } from '../../documentSearchService.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

export async function listProjectFiles(projectId: string) {
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

export async function getDatasetProfile(args: ToolCall['args']) {
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

export async function getDatasetSample(args: ToolCall['args']) {
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

export async function searchProjectDocuments(projectId: string, args: ToolCall['args']) {
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

/**
 * Data Tool Handlers - implementations for data-related tool calls
 */

import { env } from '../../../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../../../db.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import type { ToolCall } from '../../../types/llm.js';
import { searchDocuments } from '../../documentSearchService.js';

const datasetRepository = createDatasetRepository(env.datasetMetadataPath);

export async function listProjectFiles(projectId: string, args?: ToolCall['args']) {
  // The toolExecutor auto-injects `datasetId` from state.turn.datasetId into
  // every tool call's args. When present (e.g., during feature engineering),
  // we mark the matching dataset with `isActive: true` so the LLM knows which
  // dataset to operate on. Without this flag, the LLM has seen all project
  // datasets and hallucinated features targeting columns from sibling files.
  const activeDatasetId = typeof args?.datasetId === 'string' ? args.datasetId : undefined;
  const datasets = (await datasetRepository.list()).filter((dataset) => dataset.projectId === projectId);
  const documents = await listDocuments(projectId);

  return {
    ...(activeDatasetId ? { activeDatasetId } : {}),
    datasets: datasets.map((dataset) => ({
      datasetId: dataset.datasetId,
      filename: dataset.filename,
      nRows: dataset.nRows,
      nCols: dataset.nCols,
      columns: dataset.columns.map((column) => column.name),
      isActive: activeDatasetId ? dataset.datasetId === activeDatasetId : undefined
    })),
    documents: documents.map((doc) => ({
      documentId: doc.documentId,
      filename: doc.filename,
      mimeType: doc.mimeType
    })),
    ...(activeDatasetId ? {
      notice: 'During feature engineering, propose features ONLY on columns from the dataset marked `isActive: true`. Columns from other datasets belong to different workbooks and must not be referenced.'
    } : {})
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

const MAX_PROFILE_COLUMNS = 50;
const MAX_TOP_VALUES = 5;
const MAX_SAMPLE_ROWS = 10;
const MAX_SAMPLE_COLUMNS = 30;
const MAX_STRING_VALUE_LENGTH = 200;

function truncateStringValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > MAX_STRING_VALUE_LENGTH) {
    return value.slice(0, MAX_STRING_VALUE_LENGTH) + '…';
  }
  return value;
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

  const truncatedColumns = dataset.columns.slice(0, MAX_PROFILE_COLUMNS).map(col => ({
    ...col,
    topValues: (col.topValues ?? []).slice(0, MAX_TOP_VALUES)
  }));

  return {
    ...dataset,
    columns: truncatedColumns,
    ...(dataset.columns.length > MAX_PROFILE_COLUMNS
      ? { _truncated: true, _totalColumns: dataset.columns.length }
      : {})
  };
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
  const columnNames = dataset.columns.map(c => c.name).slice(0, MAX_SAMPLE_COLUMNS);
  const truncatedSample = dataset.sample.slice(0, MAX_SAMPLE_ROWS).map(row => {
    const truncatedRow: Record<string, unknown> = {};
    for (const col of columnNames) {
      truncatedRow[col] = truncateStringValue(row[col]);
    }
    return truncatedRow;
  });

  return {
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    sample: truncatedSample,
    ...(dataset.sample.length > MAX_SAMPLE_ROWS || dataset.columns.length > MAX_SAMPLE_COLUMNS
      ? { _truncated: true, _totalRows: dataset.sample.length, _totalColumns: dataset.columns.length }
      : {})
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

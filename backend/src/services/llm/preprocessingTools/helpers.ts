/**
 * Preprocessing tool helpers — core utilities
 *
 * Response builders live in ./resultBuilders.ts
 * Step serialization / lifecycle lives in ./stepSerialization.ts
 * This file retains pure utility functions and re-exports everything
 * so that existing `from './helpers.js'` imports continue to work.
 */

import { createHash } from 'node:crypto';

import type { DatasetRepository } from '../../../repositories/datasetRepository.js';
import type {
  DatasetSchemaSnapshot,
  PreprocessingRunEvent,
  PreprocessingRunState
} from '../../../repositories/preprocessingRunRepository.js';

// ── Pure utilities ──────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashCode(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 24);
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

export function mergeUniqueStrings(...groups: string[][]): string[] {
  const merged = new Set<string>();
  for (const group of groups) {
    for (const value of group) {
      if (value.trim()) {
        merged.add(value.trim());
      }
    }
  }
  return [...merged];
}

export function inferRiskyIntent(intentType: string): boolean {
  const lowered = intentType.toLowerCase();
  return lowered.includes('drop') || lowered.includes('outlier') || lowered.includes('custom');
}

export function toSchemaSnapshot(dataset: {
  datasetId: string;
  columns: Array<{ name: string; dtype: string }>;
}): DatasetSchemaSnapshot {
  return {
    datasetId: dataset.datasetId,
    columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
    capturedAt: nowIso()
  };
}

export function formatDatasetSummary(dataset: {
  datasetId: string;
  filename: string;
  nRows: number;
  nCols: number;
  columns: Array<{ name: string; dtype: string }>;
  sample?: Record<string, unknown>[];
}) {
  return {
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    nRows: dataset.nRows,
    nCols: dataset.nCols,
    columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
    sample: dataset.sample?.slice(0, 5) ?? []
  };
}

export function normalizeDatasetRef(value: string): { raw: string; noExt: string } {
  const raw = value.trim().toLowerCase();
  const lastDot = raw.lastIndexOf('.');
  const noExt = lastDot > 0 ? raw.slice(0, lastDot) : raw;
  return { raw, noExt };
}

export async function resolveProjectDataset(
  datasetRepository: DatasetRepository,
  projectId: string,
  datasetRef: string
) {
  const allDatasets = await datasetRepository.list();
  const projectDatasets = allDatasets.filter((dataset) => dataset.projectId === projectId);
  const { raw, noExt } = normalizeDatasetRef(datasetRef);

  return projectDatasets.find((dataset) => {
    if (dataset.datasetId === datasetRef) {
      return true;
    }
    const normalizedFilename = normalizeDatasetRef(dataset.filename);
    return normalizedFilename.raw === raw || normalizedFilename.noExt === noExt;
  });
}

export function collectReplayEvents(run: PreprocessingRunState, checkpointEventSequence: number): PreprocessingRunEvent[] {
  return run.events.filter((event) => event.sequence <= checkpointEventSequence);
}

export function compareSchemas(
  requiredSchema: DatasetSchemaSnapshot,
  activeColumns: Array<{ name: string; dtype: string }>,
  stepId: string
) {
  const actualByName = new Map(activeColumns.map((column) => [column.name, column.dtype]));
  const issues: Array<{
    stepId: string;
    column: string;
    expectedType?: string;
    actualType?: string;
    issue: 'missing_column' | 'dtype_mismatch';
  }> = [];

  for (const required of requiredSchema.columns) {
    const actualType = actualByName.get(required.name);
    if (!actualType) {
      issues.push({
        stepId,
        column: required.name,
        expectedType: required.dtype,
        issue: 'missing_column'
      });
      continue;
    }

    if (actualType !== required.dtype) {
      issues.push({
        stepId,
        column: required.name,
        expectedType: required.dtype,
        actualType,
        issue: 'dtype_mismatch'
      });
    }
  }

  return issues;
}

// ── Re-exports from extracted modules ───────────────────────────────────────
// These preserve backwards-compatible `from './helpers.js'` imports.

export { ok, fail } from './resultBuilders.js';

export {
  serializeStep,
  appendEvent,
  createStep,
  getOrCreateStep,
  getStep,
  ensureStepExists,
  findIncompleteBlockingStep,
  toCellBinding,
  toCellBindings,
  buildPreprocessingCellMetadata,
  computeStepDivergence
} from './stepSerialization.js';

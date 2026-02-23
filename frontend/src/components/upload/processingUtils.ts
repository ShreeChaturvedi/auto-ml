/**
 * processingUtils — Gathers ProcessingResult[] from the data store
 *
 * Reads uploaded file metadata (row counts, column counts, dtypes,
 * null counts, chunk counts) and produces human-readable result cards
 * for the processing animation stage.
 */

import type { UploadedFile } from '@/types/file';
import type { ProcessingResult } from '@/types/processing';

/** Data file extensions that represent tabular datasets */
const DATA_FILE_TYPES = new Set(['csv', 'json', 'excel']);

/** Document file extensions that are ingested for RAG */
const DOC_FILE_TYPES = new Set(['pdf', 'markdown', 'word', 'text']);

/**
 * Gather processing results from already-uploaded files.
 *
 * This does NOT call any backend endpoints — it reads from the
 * file metadata that was populated during the upload phase. The
 * ProcessingStage uses a minimum-delay timer so the animation
 * plays for at least 3 seconds regardless.
 */
export function gatherProcessingResults(files: UploadedFile[]): ProcessingResult[] {
  const results: ProcessingResult[] = [];

  const dataFiles = files.filter((f) => DATA_FILE_TYPES.has(f.type));
  const docFiles = files.filter((f) => DOC_FILE_TYPES.has(f.type));

  // ── Dataset statistics ────────────────────────────────────────
  for (const file of dataFiles) {
    const rows = file.metadata?.rowCount;
    const cols = file.metadata?.columnCount;
    if (rows != null && cols != null) {
      results.push({
        type: 'dataset_stats',
        icon: 'DS',
        label: `${file.name}: ${rows.toLocaleString()} rows × ${cols} columns`,
      });
    }
  }

  // ── Document chunk summary ────────────────────────────────────
  if (docFiles.length > 0) {
    const totalChunks = docFiles.reduce(
      (sum, f) => sum + (f.metadata?.chunkCount ?? 0),
      0,
    );
    const suffix = docFiles.length > 1 ? 's' : '';
    results.push({
      type: 'document_chunks',
      icon: 'DOC',
      label: `${docFiles.length} document${suffix} → ${totalChunks} chunks`,
    });
  }

  // ── Schema analysis (from dataset profile dtypes) ─────────────
  const allDtypes = dataFiles.flatMap((f) => {
    const dtypes = f.metadata?.datasetProfile?.dtypes;
    return dtypes ? Object.values(dtypes) : [];
  });

  if (allDtypes.length > 0) {
    const counts = categorizeDtypes(allDtypes);
    const parts: string[] = [];
    if (counts.numeric > 0) parts.push(`${counts.numeric} numeric`);
    if (counts.categorical > 0) parts.push(`${counts.categorical} categorical`);
    if (counts.datetime > 0) parts.push(`${counts.datetime} datetime`);
    if (counts.boolean > 0) parts.push(`${counts.boolean} boolean`);
    if (counts.other > 0) parts.push(`${counts.other} other`);

    if (parts.length > 0) {
      results.push({
        type: 'schema_analysis',
        icon: 'SCH',
        label: `Schema: ${parts.join(', ')}`,
      });
    }
  }

  // ── Data quality check (from null counts) ─────────────────────
  const qualityIssues = analyzeQuality(dataFiles);
  results.push({
    type: 'quality_check',
    icon: qualityIssues.length > 0 ? 'WARN' : 'OK',
    label:
      qualityIssues.length > 0
        ? qualityIssues.join('; ')
        : 'No critical quality issues',
  });

  return results;
}

// ── Helpers ──────────────────────────────────────────────────────

interface DtypeCounts {
  numeric: number;
  categorical: number;
  datetime: number;
  boolean: number;
  other: number;
}

function categorizeDtypes(dtypes: string[]): DtypeCounts {
  const counts: DtypeCounts = { numeric: 0, categorical: 0, datetime: 0, boolean: 0, other: 0 };

  for (const dtype of dtypes) {
    const d = dtype.toLowerCase();
    if (
      d.includes('int') ||
      d.includes('float') ||
      d.includes('double') ||
      d.includes('decimal') ||
      d.includes('numeric') ||
      d.includes('number') ||
      d === 'bigint' ||
      d === 'real'
    ) {
      counts.numeric++;
    } else if (
      d.includes('date') ||
      d.includes('time') ||
      d.includes('timestamp')
    ) {
      counts.datetime++;
    } else if (d.includes('bool')) {
      counts.boolean++;
    } else if (
      d.includes('text') ||
      d.includes('char') ||
      d.includes('varchar') ||
      d.includes('string') ||
      d.includes('object') ||
      d.includes('category')
    ) {
      counts.categorical++;
    } else {
      counts.other++;
    }
  }

  return counts;
}

function analyzeQuality(dataFiles: UploadedFile[]): string[] {
  const issues: string[] = [];

  for (const file of dataFiles) {
    const profile = file.metadata?.datasetProfile;
    if (!profile) continue;

    const { nRows, nullCounts } = profile;
    if (nRows === 0) continue;

    const highNullCols = Object.entries(nullCounts).filter(
      ([, count]) => count / nRows > 0.2,
    );

    if (highNullCols.length > 0) {
      issues.push(
        `${highNullCols.length} column${highNullCols.length > 1 ? 's' : ''} with >20% nulls`,
      );
    }
  }

  return issues;
}

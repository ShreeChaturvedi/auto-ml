import { env } from '../../config.js';
import type { DatasetRepository } from '../../repositories/datasetRepository.js';

import { extractJson } from './jsonNormalization.js';
import { fallbackTableName, normalizeTableName, resolveDefaultTableName } from './tableResolution.js';
import type { JoinCandidate, SchemaTableContext } from './types.js';

export function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(3));
}

function normalizeColumnName(value: string): string {
  return value.trim().toLowerCase();
}

function isLikelyJoinKey(columnName: string): boolean {
  const normalized = normalizeColumnName(columnName);
  return normalized === 'id' || normalized.endsWith('_id') || normalized.endsWith('id');
}

export function inferJoinCandidates(tables: SchemaTableContext[]): JoinCandidate[] {
  const candidates: JoinCandidate[] = [];

  for (let i = 0; i < tables.length; i += 1) {
    for (let j = i + 1; j < tables.length; j += 1) {
      const left = tables[i];
      const right = tables[j];
      const rightCols = new Map(
        right.columns.map((column) => [normalizeColumnName(column.name), column.name])
      );

      left.columns.forEach((leftColumn) => {
        const normalizedLeft = normalizeColumnName(leftColumn.name);
        const rightMatch = rightCols.get(normalizedLeft);

        if (rightMatch && isLikelyJoinKey(leftColumn.name)) {
          const confidence = normalizedLeft === 'id' ? 0.55 : 0.72;
          candidates.push({
            leftTable: left.tableName,
            leftColumn: leftColumn.name,
            rightTable: right.tableName,
            rightColumn: rightMatch,
            confidence,
            reason: normalizedLeft === 'id'
              ? 'Both tables have a generic id column (ambiguous primary key match).'
              : 'Both tables share a similarly named key column.'
          });
        }

        if (normalizedLeft.endsWith('_id')) {
          const singular = normalizedLeft.slice(0, -3);
          const rightId = rightCols.get('id');
          const rightName = normalizeColumnName(right.tableName);
          if (rightId && (rightName.includes(singular) || singular.includes(rightName))) {
            candidates.push({
              leftTable: left.tableName,
              leftColumn: leftColumn.name,
              rightTable: right.tableName,
              rightColumn: rightId,
              confidence: 0.83,
              reason: `Foreign-key style match: ${leftColumn.name} to ${right.tableName}.id`
            });
          }
        }
      });
    }
  }

  const deduped = new Map<string, JoinCandidate>();
  candidates.forEach((candidate) => {
    const key = [
      candidate.leftTable,
      candidate.leftColumn,
      candidate.rightTable,
      candidate.rightColumn
    ].join('|');
    const existing = deduped.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      deduped.set(key, candidate);
    }
  });

  return Array.from(deduped.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 24);
}

export async function buildSchemaContext(
  datasetRepository: DatasetRepository,
  projectId: string,
  defaultTable?: string
): Promise<{
  tables: SchemaTableContext[];
  defaultTableName: string | null;
  joinCandidates: JoinCandidate[];
}> {
  const datasets = await datasetRepository.list();
  const projectDatasets = datasets.filter((dataset) => dataset.projectId === projectId);

  const tables = projectDatasets
    .map((dataset) => {
      const meta = dataset.metadata && typeof dataset.metadata === 'object'
        ? dataset.metadata as Record<string, unknown>
        : {};
      const metadataTable = typeof meta.tableName === 'string' ? meta.tableName : '';
      const tableName = normalizeTableName(metadataTable)
        || fallbackTableName(dataset.filename, dataset.datasetId);

      const columns = dataset.columns
        .slice(0, Math.max(1, env.nl2sqlMaxColumnsPerTable))
        .map((column) => ({
          name: column.name,
          dtype: column.dtype
        }));

      return {
        tableName,
        sourceFilename: dataset.filename,
        rowCount: dataset.nRows,
        columns
      } satisfies SchemaTableContext;
    })
    .slice(0, Math.max(1, env.nl2sqlMaxTablesContext));

  const defaultTableName = resolveDefaultTableName(tables, defaultTable);

  return {
    tables,
    defaultTableName,
    joinCandidates: inferJoinCandidates(tables)
  };
}

// Re-exports so existing consumers continue to work
export {
  requiresIdentifierQuoting,
  quoteIdentifier,
  buildCaseSensitiveIdentifierLookup,
  normalizeCaseSensitiveIdentifiers
} from './identifiers.js';

export {
  formatTableContextForPrompt,
  buildCaseSensitiveIdentifierHint,
  buildCaseNormalizationValidationNote,
  buildPass1Prompt,
  buildPass2Prompt,
  buildPass2FallbackPrompt,
  buildRepairPrompt
} from './promptBuilders.js';

export {
  formatSchemaContextMarkdown,
  formatPlanningMarkdown,
  formatSqlGenerationMarkdown,
  formatValidationMarkdown,
  formatRepairMarkdown
} from './formatting.js';

// Re-export extractJson so schemaContext consumers don't need a separate import
export { extractJson };

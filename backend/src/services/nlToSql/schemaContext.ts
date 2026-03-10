import { z } from 'zod';

import { env } from '../../config.js';
import type { DatasetRepository } from '../../repositories/datasetRepository.js';

import { extractJson } from './jsonNormalization.js';
import { fallbackTableName, normalizeTableName, resolveDefaultTableName } from './tableResolution.js';
import type { JoinCandidate, PASS1_SCHEMA, SchemaColumnContext, SchemaTableContext } from './types.js';

const SIMPLE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

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

export function requiresIdentifierQuoting(identifier: string): boolean {
  return !SIMPLE_IDENTIFIER_PATTERN.test(identifier);
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function buildCaseSensitiveIdentifierLookup(tables: SchemaTableContext[]): Map<string, string> {
  const collisionMap = new Map<string, Set<string>>();

  const addIdentifier = (identifier: string) => {
    if (!requiresIdentifierQuoting(identifier)) {
      return;
    }
    const key = identifier.toLowerCase();
    const existing = collisionMap.get(key) ?? new Set<string>();
    existing.add(identifier);
    collisionMap.set(key, existing);
  };

  tables.forEach((table) => {
    addIdentifier(table.tableName);
    table.columns.forEach((column) => addIdentifier(column.name));
  });

  const lookup = new Map<string, string>();
  collisionMap.forEach((values, key) => {
    if (values.size === 1) {
      const [canonical] = Array.from(values);
      lookup.set(key, canonical);
    }
  });

  return lookup;
}

export function normalizeCaseSensitiveIdentifiers(
  sql: string,
  tables: SchemaTableContext[]
): { sql: string; replacements: string[] } {
  const lookup = buildCaseSensitiveIdentifierLookup(tables);
  if (lookup.size === 0 || !sql.trim()) {
    return { sql, replacements: [] };
  }

  let i = 0;
  const out: string[] = [];
  const applied = new Set<string>();

  while (i < sql.length) {
    const current = sql[i];
    const next = sql[i + 1];

    if (current === '-' && next === '-') {
      const end = sql.indexOf('\n', i + 2);
      if (end === -1) {
        out.push(sql.slice(i));
        i = sql.length;
      } else {
        out.push(sql.slice(i, end + 1));
        i = end + 1;
      }
      continue;
    }

    if (current === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) {
        out.push(sql.slice(i));
        i = sql.length;
      } else {
        out.push(sql.slice(i, end + 2));
        i = end + 2;
      }
      continue;
    }

    if (current === '\'') {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === '\'' && sql[end + 1] === '\'') {
          end += 2;
          continue;
        }
        if (sql[end] === '\'') {
          end += 1;
          break;
        }
        end += 1;
      }
      out.push(sql.slice(i, end));
      i = end;
      continue;
    }

    if (current === '"') {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === '"' && sql[end + 1] === '"') {
          end += 2;
          continue;
        }
        if (sql[end] === '"') {
          end += 1;
          break;
        }
        end += 1;
      }
      out.push(sql.slice(i, end));
      i = end;
      continue;
    }

    if (/[a-zA-Z_]/.test(current)) {
      let end = i + 1;
      while (end < sql.length && /[a-zA-Z0-9_$]/.test(sql[end])) {
        end += 1;
      }
      const token = sql.slice(i, end);
      const canonical = lookup.get(token.toLowerCase());
      if (canonical) {
        out.push(quoteIdentifier(canonical));
        applied.add(canonical);
      } else {
        out.push(token);
      }
      i = end;
      continue;
    }

    out.push(current);
    i += 1;
  }

  return {
    sql: out.join(''),
    replacements: Array.from(applied.values()).sort()
  };
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

function formatColumnContextForPrompt(column: SchemaColumnContext): string {
  if (!requiresIdentifierQuoting(column.name)) {
    return `${column.name}:${column.dtype}`;
  }
  return `${column.name}:${column.dtype} (must reference as ${quoteIdentifier(column.name)})`;
}

export function formatTableContextForPrompt(
  tables: SchemaTableContext[],
  includeRowCount: boolean
): string {
  return tables
    .map((table) => {
      const prefix = includeRowCount
        ? `${table.tableName} (${table.rowCount} rows)`
        : table.tableName;
      return `- ${prefix}: ${table.columns.map((column) => formatColumnContextForPrompt(column)).join(', ')}`;
    })
    .join('\n');
}

export function buildCaseSensitiveIdentifierHint(tables: SchemaTableContext[]): string {
  const identifiers = Array.from(buildCaseSensitiveIdentifierLookup(tables).values())
    .map((identifier) => quoteIdentifier(identifier));
  if (identifiers.length === 0) {
    return 'Case-sensitive identifiers requiring double quotes: none.';
  }
  return `Case-sensitive identifiers requiring double quotes: ${identifiers.join(', ')}.`;
}

export function buildCaseNormalizationValidationNote(replacements: string[]): string | null {
  if (replacements.length === 0) {
    return null;
  }
  return `Normalized case-sensitive identifiers with double quotes: ${replacements.map((id) => quoteIdentifier(id)).join(', ')}.`;
}

function formatInlineList(items: string[], emptyCopy: string): string {
  return items.length > 0 ? items.join('; ') : emptyCopy;
}

function formatJoinPlanMarkdown(joinPlan: z.infer<typeof PASS1_SCHEMA>['joinPlan']): string {
  return formatInlineList(
    joinPlan.map((join) => (
      `\`${join.leftTable}.${join.leftColumn}\` -> \`${join.rightTable}.${join.rightColumn}\` `
      + `(${join.joinType}, ${Math.round(clampConfidence(join.confidence) * 100)}%)`
    )),
    'No join steps were needed.'
  );
}

export function formatSchemaContextMarkdown(params: {
  tables: SchemaTableContext[];
  defaultTableName: string | null;
  joinCandidates: JoinCandidate[];
}): string {
  const tableLines = params.tables.map((table) => {
    const columns = table.columns
      .slice(0, 6)
      .map((column) => `\`${column.name}\``)
      .join(', ');
    const overflow = table.columns.length > 6 ? `, +${table.columns.length - 6} more` : '';
    return `- \`${table.tableName}\` • ${table.rowCount} rows • ${columns}${overflow}`;
  });

  const joinSummary = params.joinCandidates
    .slice(0, 6)
    .map((join) => (
      `\`${join.leftTable}.${join.leftColumn}\` -> \`${join.rightTable}.${join.rightColumn}\` `
      + `(${Math.round(clampConfidence(join.confidence) * 100)}%): ${join.reason}`
    ));

  return [
    `**Default table:** ${params.defaultTableName ? `\`${params.defaultTableName}\`` : 'not set'}`,
    `**Tables in scope:** ${params.tables.length}`,
    '',
    ...(tableLines.length > 0 ? tableLines : ['- No tables were available.']),
    '',
    `**Relationship hints:** ${formatInlineList(joinSummary, 'No relationship hints were inferred.')}`
  ].join('\n');
}

export function formatPlanningMarkdown(planning: z.infer<typeof PASS1_SCHEMA>): string {
  return [
    `**Intent:** ${planning.intentSummary}`,
    `**Tables:** ${formatInlineList(
      planning.selectedTables.map((table) => `\`${table}\``),
      'No tables were selected.'
    )}`,
    `**Joins:** ${formatJoinPlanMarkdown(planning.joinPlan)}`,
    `**Filters:** ${formatInlineList(planning.filters, 'No explicit filters were called out.')}`,
    `**Aggregations:** ${formatInlineList(planning.aggregations, 'No aggregations were called out.')}`,
    `**Assumptions:** ${formatInlineList(planning.assumptions, 'No explicit assumptions were reported.')}`,
    `**Confidence:** ${Math.round(clampConfidence(planning.confidence) * 100)}%`
  ].join('\n\n');
}

export function formatSqlGenerationMarkdown(execution: {
  sql: string;
  rationale: string;
  assumptions?: string[];
  validationNotes?: string[];
  confidence?: number;
}): string {
  return [
    `**Rationale:** ${execution.rationale}`,
    `**Assumptions:** ${formatInlineList(
      execution.assumptions ?? [],
      'No explicit assumptions were reported.'
    )}`,
    `**Notes:** ${formatInlineList(
      execution.validationNotes ?? [],
      'Validation notes will appear in the validation step.'
    )}`,
    ...(typeof execution.confidence === 'number'
      ? [`**Confidence:** ${Math.round(clampConfidence(execution.confidence) * 100)}%`]
      : []),
    '',
    '```sql',
    execution.sql,
    '```'
  ].join('\n');
}

export function formatValidationMarkdown(notes: string[]): string {
  return `**Validation:** ${formatInlineList(notes, 'No validation notes were reported.')}`;
}

export function formatRepairMarkdown(params: {
  sql: string;
  rationale: string;
  assumptions: string[];
  validationNotes: string[];
  confidence: number;
}): string {
  return [
    `**Repair rationale:** ${params.rationale}`,
    `**Assumptions:** ${formatInlineList(params.assumptions, 'No new assumptions were introduced.')}`,
    `**Validation notes:** ${formatInlineList(params.validationNotes, 'No new validation notes were reported.')}`,
    `**Confidence:** ${Math.round(clampConfidence(params.confidence) * 100)}%`,
    '',
    '```sql',
    params.sql,
    '```'
  ].join('\n');
}

export function buildPass1Prompt(params: {
  nlQuery: string;
  defaultTableName: string | null;
  tables: SchemaTableContext[];
  joinCandidates: JoinCandidate[];
}): string {
  const tableSummary = formatTableContextForPrompt(params.tables, true);

  const joinSummary = params.joinCandidates.length > 0
    ? params.joinCandidates
      .slice(0, 16)
      .map((join) => `- ${join.leftTable}.${join.leftColumn} -> ${join.rightTable}.${join.rightColumn} (confidence ${join.confidence}) reason: ${join.reason}`)
      .join('\n')
    : '- (none inferred)';

  return [
    'Analyze the analytics intent and produce a query plan JSON.',
    'Prioritize practical business-insight queries. Best-guess joins are allowed but must be called out in assumptions.',
    'Use only tables/columns from the provided schema context.',
    'PostgreSQL folds unquoted identifiers to lowercase. Any mixed-case/uppercase identifier must be wrapped in double quotes exactly.',
    buildCaseSensitiveIdentifierHint(params.tables),
    `Default table: ${params.defaultTableName ?? '(none)'}`,
    `User query: ${params.nlQuery}`,
    'Available tables:',
    tableSummary || '- (no tables)',
    'Join candidates:',
    joinSummary,
    'Return JSON only with keys:',
    'intentSummary, selectedTables, joinPlan, filters, aggregations, assumptions, confidence',
    'confidence must be a number in [0,1].'
  ].join('\n');
}

export function buildPass2Prompt(params: {
  nlQuery: string;
  defaultTableName: string | null;
  tables: SchemaTableContext[];
  planning: z.infer<typeof PASS1_SCHEMA>;
}): string {
  const tableSummary = formatTableContextForPrompt(params.tables, false);

  return [
    'Generate final SQL and explanation JSON for this analytics query.',
    'SQL requirements: read-only SELECT/CTE only, no multiple statements, include an explicit LIMIT.',
    'You may best-guess joins when needed, but every risky assumption must be explicit.',
    'PostgreSQL identifier rule: if an identifier is mixed-case/uppercase, wrap it in double quotes exactly as listed.',
    buildCaseSensitiveIdentifierHint(params.tables),
    `User query: ${params.nlQuery}`,
    `Default table: ${params.defaultTableName ?? '(none)'}`,
    'Schema:',
    tableSummary || '- (no tables)',
    'Planning result JSON:',
    JSON.stringify(params.planning),
    'Return JSON only with keys:',
    'sql, rationale, intentSummary, selectedTables, joinPlan, filters, aggregations, assumptions, validationNotes, confidence',
    'confidence must be a number in [0,1].'
  ].join('\n');
}

export function buildPass2FallbackPrompt(params: {
  nlQuery: string;
  defaultTableName: string | null;
  tables: SchemaTableContext[];
  planning: z.infer<typeof PASS1_SCHEMA>;
  recoveryReason: string;
}): string {
  const compactSchema = formatTableContextForPrompt(params.tables, false);

  return [
    'The previous SQL generation attempt returned invalid structured output. Return a compact JSON response.',
    'Generate one valid read-only SQL SELECT/CTE query with an explicit LIMIT.',
    'Use only provided tables/columns. Never invent columns.',
    'PostgreSQL identifier rule: mixed-case/uppercase identifiers must use double quotes.',
    buildCaseSensitiveIdentifierHint(params.tables),
    `User query: ${params.nlQuery}`,
    `Default table: ${params.defaultTableName ?? '(none)'}`,
    `Recovery reason: ${params.recoveryReason}`,
    'Planning hints:',
    JSON.stringify({
      intentSummary: params.planning.intentSummary,
      selectedTables: params.planning.selectedTables,
      joinPlan: params.planning.joinPlan,
      filters: params.planning.filters,
      aggregations: params.planning.aggregations
    }),
    'Schema:',
    compactSchema || '- (no tables)',
    'Return JSON only with keys: sql, rationale, assumptions, confidence'
  ].join('\n');
}

export function buildRepairPrompt(params: {
  nlQuery: string;
  failedSql: string;
  executionError: string;
  defaultTableName: string | null;
  tables: SchemaTableContext[];
}): string {
  const tableSummary = formatTableContextForPrompt(params.tables, false);

  return [
    'The SQL below failed execution. Repair it using ONLY valid table/column names from schema.',
    'Never invent shorthand columns. Keep query read-only SELECT/CTE and include explicit LIMIT.',
    'PostgreSQL identifier rule: unquoted identifiers are lowercased, so mixed-case/uppercase identifiers must be wrapped in double quotes exactly.',
    buildCaseSensitiveIdentifierHint(params.tables),
    `Original NL query: ${params.nlQuery}`,
    `Default table: ${params.defaultTableName ?? '(none)'}`,
    `Failed SQL: ${params.failedSql}`,
    `Database error: ${params.executionError}`,
    'Schema:',
    tableSummary || '- (no tables)',
    'Return JSON only with keys:',
    'sql, rationale, assumptions, validationNotes, confidence',
    'confidence must be in [0,1] when provided.'
  ].join('\n');
}

// Re-export extractJson so schemaContext consumers don't need a separate import
export { extractJson };

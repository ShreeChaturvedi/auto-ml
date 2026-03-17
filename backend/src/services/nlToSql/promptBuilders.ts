import { z } from 'zod';

import { buildCaseSensitiveIdentifierLookup, quoteIdentifier, requiresIdentifierQuoting } from './identifiers.js';
import type { JoinCandidate, PASS1_SCHEMA, SchemaColumnContext, SchemaTableContext } from './types.js';

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

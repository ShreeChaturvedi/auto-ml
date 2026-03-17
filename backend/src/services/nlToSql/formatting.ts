import { z } from 'zod';

import { clampConfidence } from './schemaContext.js';
import type { JoinCandidate, PASS1_SCHEMA, SchemaTableContext } from './types.js';

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

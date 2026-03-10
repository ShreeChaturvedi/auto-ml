import { asNumber, asRecord, asString } from '../../utils/typeCoercion.js';

import type { JsonRecord, Pass1JoinPlanItem } from './types.js';

function stringifyRecord(record: JsonRecord): string {
  const preferredKeys = [
    'query',
    'sql',
    'text',
    'summary',
    'description',
    'reason',
    'assumption',
    'table',
    'tableName',
    'name',
    'label',
    'value',
    'column',
    'type',
    'metric',
    'note'
  ];

  for (const key of preferredKeys) {
    const maybe = asString(record[key]);
    if (maybe) {
      return maybe;
    }
  }

  return JSON.stringify(record);
}

export function normalizeStringLike(value: unknown): string | null {
  const direct = asString(value);
  if (direct) {
    return direct;
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return stringifyRecord(record);
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeStringLike(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function normalizeJoinType(value: unknown): 'inner' | 'left' | 'right' | 'full' {
  const raw = asString(value)?.toLowerCase();
  if (raw === 'left' || raw === 'right' || raw === 'full' || raw === 'inner') {
    return raw;
  }
  return 'inner';
}

export function normalizeConfidenceValue(value: unknown, fallback: number): number {
  const numeric = asNumber(value);
  if (numeric === undefined) {
    return fallback;
  }
  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }
  return numeric;
}

export function normalizeJoinPlan(value: unknown): Pass1JoinPlanItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) {
        return null;
      }

      const left = asRecord(record.left);
      const right = asRecord(record.right);

      const leftTable = asString(record.leftTable)
        ?? asString(record.left_table)
        ?? asString(left?.table)
        ?? asString(left?.tableName);
      const leftColumn = asString(record.leftColumn)
        ?? asString(record.left_column)
        ?? asString(left?.column)
        ?? asString(left?.columnName);
      const rightTable = asString(record.rightTable)
        ?? asString(record.right_table)
        ?? asString(right?.table)
        ?? asString(right?.tableName);
      const rightColumn = asString(record.rightColumn)
        ?? asString(record.right_column)
        ?? asString(right?.column)
        ?? asString(right?.columnName);

      if (!leftTable || !leftColumn || !rightTable || !rightColumn) {
        return null;
      }

      return {
        leftTable,
        leftColumn,
        rightTable,
        rightColumn,
        joinType: normalizeJoinType(record.joinType ?? record.join_type),
        confidence: asNumber(record.confidence) ?? 0.5,
        reason: asString(record.reason)
          ?? asString(record.rationale)
          ?? asString(record.explanation)
          ?? 'Join inferred by model.'
      };
    })
    .filter((entry): entry is Pass1JoinPlanItem => Boolean(entry));
}

export function normalizePass1Output(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return {
    intentSummary: normalizeStringLike(record.intentSummary ?? record.intent ?? record.summary) ?? '',
    selectedTables: normalizeStringArray(record.selectedTables ?? record.tables),
    joinPlan: normalizeJoinPlan(record.joinPlan ?? record.joins),
    filters: normalizeStringArray(record.filters),
    aggregations: normalizeStringArray(record.aggregations),
    assumptions: normalizeStringArray(record.assumptions),
    confidence: normalizeConfidenceValue(record.confidence, 0.5)
  };
}

export function normalizePass2Output(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return {
    sql: normalizeStringLike(record.sql ?? record.query) ?? '',
    rationale: normalizeStringLike(record.rationale ?? record.reasoning ?? record.explanation) ?? '',
    intentSummary: normalizeStringLike(record.intentSummary ?? record.intent ?? record.summary) ?? undefined,
    selectedTables: normalizeStringArray(record.selectedTables ?? record.tables),
    joinPlan: normalizeJoinPlan(record.joinPlan ?? record.joins),
    filters: normalizeStringArray(record.filters),
    aggregations: normalizeStringArray(record.aggregations),
    assumptions: normalizeStringArray(record.assumptions),
    validationNotes: normalizeStringArray(record.validationNotes ?? record.validation),
    confidence: normalizeConfidenceValue(record.confidence, 0.5)
  };
}

export function normalizeRepairOutput(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return {
    sql: normalizeStringLike(record.sql ?? record.query) ?? '',
    rationale: normalizeStringLike(record.rationale ?? record.reasoning ?? record.explanation) ?? 'Adjusted SQL after execution error.',
    assumptions: normalizeStringArray(record.assumptions),
    validationNotes: normalizeStringArray(record.validationNotes ?? record.validation),
    confidence: asNumber(record.confidence) === undefined
      ? undefined
      : normalizeConfidenceValue(record.confidence, 0.5)
  };
}

export function normalizePass2FallbackOutput(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return {
    sql: normalizeStringLike(record.sql ?? record.query) ?? '',
    rationale: normalizeStringLike(record.rationale ?? record.reasoning ?? record.explanation) ?? '',
    assumptions: normalizeStringArray(record.assumptions),
    confidence: normalizeConfidenceValue(record.confidence, 0.6)
  };
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Model returned an empty response.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fenced extraction.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error('Response did not contain valid JSON.');
}

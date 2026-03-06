import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { env } from '../config.js';
import { createDatasetRepository, type DatasetRepository } from '../repositories/datasetRepository.js';

import {
  type LlmClient,
  type LlmMessage,
  createLlmClient
} from './llm/llmClient.js';
import {
  getDefaultLlmModel,
  getDefaultReasoningEffortForModel,
  normalizeReasoningSelection,
  type LlmReasoningEffort
} from './llm/modelCatalog.js';
import { validateReadOnlySql } from './sqlValidator.js';

export type WarningLevel = 'none' | 'low' | 'medium' | 'high';
export type NlConfidenceMode = 'model' | 'heuristic' | 'deterministic_fallback' | 'repair';
export type NlReliabilityTier = 'high' | 'medium' | 'low';
export type NlProgressPhaseId =
  | 'schema_context'
  | 'planning'
  | 'sql_generation'
  | 'validation'
  | 'initial_execution'
  | 'repair'
  | 'done';
export type NlProgressStatus = 'started' | 'progress' | 'completed' | 'failed';

export interface NlProgressEvent {
  phaseId: NlProgressPhaseId;
  status: NlProgressStatus;
  summary: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type NlModelWorkKind =
  | 'thinking'
  | 'plan'
  | 'tool'
  | 'sql'
  | 'validation'
  | 'repair'
  | 'status';

interface NlModelWorkEventBase {
  blockId: string;
  phaseId: NlProgressPhaseId;
  kind: NlModelWorkKind;
  title: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface NlModelWorkBlockStartedEvent extends NlModelWorkEventBase {
  type: 'model_work_block_started';
}

export interface NlModelWorkDeltaEvent extends NlModelWorkEventBase {
  type: 'model_work_delta';
  delta: string;
}

export interface NlModelWorkBlockCompletedEvent extends NlModelWorkEventBase {
  type: 'model_work_block_completed';
  status?: 'completed' | 'failed';
}

export type NlModelWorkEvent =
  | NlModelWorkBlockStartedEvent
  | NlModelWorkDeltaEvent
  | NlModelWorkBlockCompletedEvent;

export interface NlJoinPlan {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: 'inner' | 'left' | 'right' | 'full';
  confidence: number;
  reason: string;
}

export interface NlExplanation {
  intentSummary: string;
  selectedTables: string[];
  joinPlan: NlJoinPlan[];
  filters: string[];
  aggregations: string[];
  assumptions: string[];
  validationNotes: string[];
  confidence: number;
  warningLevel: WarningLevel;
  confidenceMode: NlConfidenceMode;
  reliabilityTier: NlReliabilityTier;
}

export interface NlProviderInfo {
  id: string;
  label: string;
  model: string;
}

export interface GeneratedSqlV2 {
  sql: string;
  rationale: string;
  queryId: string;
  explanation: NlExplanation;
  provider: NlProviderInfo;
}

export interface GenerateSqlV2Options {
  projectId: string;
  nlQuery: string;
  defaultTable?: string;
  onProgress?: (event: NlProgressEvent) => void;
  onModelWork?: (event: NlModelWorkEvent) => void;
}

export interface RepairSqlV2Options {
  projectId: string;
  nlQuery: string;
  failedSql: string;
  executionError: string;
  defaultTable?: string;
  priorExplanation?: NlExplanation;
  onProgress?: (event: NlProgressEvent) => void;
  onModelWork?: (event: NlModelWorkEvent) => void;
}

interface Nl2SqlServiceDeps {
  datasetRepository: DatasetRepository;
  getClient: (model: string) => LlmClient;
}

interface SchemaColumnContext {
  name: string;
  dtype: string;
}

interface SchemaTableContext {
  tableName: string;
  sourceFilename: string;
  rowCount: number;
  columns: SchemaColumnContext[];
}

interface JoinCandidate {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  confidence: number;
  reason: string;
}

type JsonRecord = Record<string, unknown>;

const SIMPLE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

const PASS1_SCHEMA = z.object({
  intentSummary: z.string().min(1),
  selectedTables: z.array(z.string().min(1)).default([]),
  joinPlan: z.array(
    z.object({
      leftTable: z.string().min(1),
      leftColumn: z.string().min(1),
      rightTable: z.string().min(1),
      rightColumn: z.string().min(1),
      joinType: z.enum(['inner', 'left', 'right', 'full']).default('inner'),
      confidence: z.number().min(0).max(1).default(0.5),
      reason: z.string().min(1)
    })
  ).default([]),
  filters: z.array(z.string()).default([]),
  aggregations: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5)
});

type Pass1JoinPlanItem = z.infer<typeof PASS1_SCHEMA>['joinPlan'][number];

const PASS2_SCHEMA = z.object({
  sql: z.string().min(1),
  rationale: z.string().min(1),
  intentSummary: z.string().min(1).optional(),
  selectedTables: z.array(z.string().min(1)).default([]),
  joinPlan: z.array(
    z.object({
      leftTable: z.string().min(1),
      leftColumn: z.string().min(1),
      rightTable: z.string().min(1),
      rightColumn: z.string().min(1),
      joinType: z.enum(['inner', 'left', 'right', 'full']).default('inner'),
      confidence: z.number().min(0).max(1).default(0.5),
      reason: z.string().min(1)
    })
  ).default([]),
  filters: z.array(z.string()).default([]),
  aggregations: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  validationNotes: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5)
});

const REPAIR_SCHEMA = z.object({
  sql: z.string().min(1),
  rationale: z.string().min(1).default('Adjusted SQL after execution error.'),
  assumptions: z.array(z.string()).default([]),
  validationNotes: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional()
});

const PASS2_FALLBACK_SCHEMA = z.object({
  sql: z.string().min(1),
  rationale: z.string().min(1),
  assumptions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.6)
});

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeConfidenceValue(value: unknown, fallback: number): number {
  const numeric = asNumber(value);
  if (numeric === null) {
    return fallback;
  }
  if (numeric > 1 && numeric <= 100) {
    return numeric / 100;
  }
  return numeric;
}

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

function normalizeStringLike(value: unknown): string | null {
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeStringLike(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeJoinType(value: unknown): 'inner' | 'left' | 'right' | 'full' {
  const raw = asString(value)?.toLowerCase();
  if (raw === 'left' || raw === 'right' || raw === 'full' || raw === 'inner') {
    return raw;
  }
  return 'inner';
}

function normalizeJoinPlan(value: unknown): Pass1JoinPlanItem[] {
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

function normalizePass1Output(value: unknown): unknown {
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

function normalizePass2Output(value: unknown): unknown {
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

function normalizeRepairOutput(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  return {
    sql: normalizeStringLike(record.sql ?? record.query) ?? '',
    rationale: normalizeStringLike(record.rationale ?? record.reasoning ?? record.explanation) ?? 'Adjusted SQL after execution error.',
    assumptions: normalizeStringArray(record.assumptions),
    validationNotes: normalizeStringArray(record.validationNotes ?? record.validation),
    confidence: asNumber(record.confidence) === null
      ? undefined
      : normalizeConfidenceValue(record.confidence, 0.5)
  };
}

function normalizePass2FallbackOutput(value: unknown): unknown {
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

function defaultGetClient(model: string): LlmClient {
  const timeoutMs = env.nl2sqlTimeoutMs > 0 ? env.nl2sqlTimeoutMs : env.llmTimeoutMs;
  return createLlmClient(model, timeoutMs);
}

function getNlProviderInfo(model: string): NlProviderInfo {
  return {
    id: 'openai',
    label: 'OpenAI',
    model
  };
}

function fallbackTableName(filename: string, datasetId: string): string {
  const baseName = filename.replace(/\.[^/.]+$/, '');
  const safe = baseName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/_$/, '')
    .replace(/^[^a-zA-Z]/, `table_${datasetId.slice(0, 6)}_`)
    .toLowerCase();

  if (!safe) {
    return `table_${datasetId.slice(0, 8)}`;
  }

  return safe.slice(0, 63);
}

function normalizeTableName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
}

function canonicalTableKey(value: string): string {
  return normalizeTableName(value)
    .toLowerCase()
    .replace(/_[a-f0-9]{8}$/i, '');
}

function isTableNameMatch(candidate: string, requested: string): boolean {
  const candidateNormalized = normalizeTableName(candidate).toLowerCase();
  const requestedNormalized = normalizeTableName(requested).toLowerCase();
  if (!candidateNormalized || !requestedNormalized) {
    return false;
  }

  if (candidateNormalized === requestedNormalized) {
    return true;
  }

  if (canonicalTableKey(candidate) === canonicalTableKey(requested)) {
    return true;
  }

  return candidateNormalized.startsWith(`${requestedNormalized}_`)
    || requestedNormalized.startsWith(`${candidateNormalized}_`);
}

function resolveDefaultTableName(
  tables: SchemaTableContext[],
  requestedDefault?: string
): string | null {
  const normalizedDefault = normalizeTableName(requestedDefault ?? '');
  if (!normalizedDefault) {
    return null;
  }

  const match = tables.find((table) => isTableNameMatch(table.tableName, normalizedDefault));
  return match?.tableName ?? normalizedDefault;
}

function clampConfidence(value: number): number {
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

function deriveWarningLevel(
  confidence: number,
  assumptions: string[],
  joinPlan: NlJoinPlan[],
  warnThreshold: number
): WarningLevel {
  const ambiguousJoinCount = joinPlan.filter((join) => join.confidence < 0.6).length;
  const riskyAssumptionCount = assumptions.filter((entry) => {
    const normalized = entry.toLowerCase();
    return (
      normalized.includes('assum')
      || normalized.includes('infer')
      || normalized.includes('best guess')
      || normalized.includes('may ')
      || normalized.includes('might ')
      || normalized.includes('likely')
      || normalized.includes('unclear')
      || normalized.includes('unknown')
      || normalized.includes('approx')
      || normalized.includes('estimate')
    );
  }).length;

  if (confidence < 0.45 || ambiguousJoinCount >= 2 || riskyAssumptionCount >= 3) {
    return 'high';
  }

  if (confidence < warnThreshold || ambiguousJoinCount >= 1 || riskyAssumptionCount >= 2) {
    return 'medium';
  }

  if (confidence >= 0.9 && ambiguousJoinCount === 0 && riskyAssumptionCount <= 1) {
    return 'none';
  }

  if (confidence < 0.85 || riskyAssumptionCount >= 1) {
    return 'low';
  }

  return 'none';
}

function deriveReliabilityTier(
  confidenceMode: NlConfidenceMode,
  warningLevel: WarningLevel
): NlReliabilityTier {
  if (confidenceMode === 'deterministic_fallback') {
    return 'low';
  }

  if (confidenceMode === 'heuristic' || confidenceMode === 'repair') {
    if (warningLevel === 'high' || warningLevel === 'medium') {
      return 'low';
    }
    return 'medium';
  }

  if (warningLevel === 'none') {
    return 'high';
  }
  if (warningLevel === 'low') {
    return 'medium';
  }
  return 'low';
}

function resolveWarnConfidenceThreshold(): number {
  return Number.isFinite(env.nl2sqlWarnConfidenceThreshold)
    ? env.nl2sqlWarnConfidenceThreshold
    : 0.72;
}

function buildCaseNormalizationValidationNote(replacements: string[]): string | null {
  if (replacements.length === 0) {
    return null;
  }
  return `Normalized case-sensitive identifiers with double quotes: ${replacements.map((id) => quoteIdentifier(id)).join(', ')}.`;
}

function normalizeColumnName(value: string): string {
  return value.trim().toLowerCase();
}

function requiresIdentifierQuoting(identifier: string): boolean {
  return !SIMPLE_IDENTIFIER_PATTERN.test(identifier);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function buildCaseSensitiveIdentifierLookup(tables: SchemaTableContext[]): Map<string, string> {
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

function normalizeCaseSensitiveIdentifiers(
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

function inferJoinCandidates(tables: SchemaTableContext[]): JoinCandidate[] {
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

function extractJson(text: string): unknown {
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

function isTimeoutLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    return normalized.includes('timed out')
      || normalized.includes('timeout')
      || normalized.includes('aborted')
      || normalized.includes('aborterror');
  }
  return false;
}

function isProviderFailureLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalized = error.message.toLowerCase();
  return normalized.includes('"code": 503')
    || normalized.includes('"status": "unavailable"')
    || normalized.includes('"status":"unavailable"')
    || normalized.includes('service unavailable')
    || normalized.includes('fetch failed')
    || normalized.includes('socketerror')
    || normalized.includes('und_err_socket')
    || normalized.includes('econnreset')
    || normalized.includes('other side closed');
}

function summarizeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }

  const compact = error.message
    .replace(/\s+/g, ' ')
    .replace(/[{}"]/g, '')
    .trim();
  if (!compact) {
    return 'unknown error';
  }
  return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
}

function toStructuredRequestError(label: string, error: unknown): Error {
  if (isTimeoutLikeError(error)) {
    return new Error(`${label} request timed out after ${env.nl2sqlTimeoutMs}ms.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function emitNlProgress(
  onProgress: ((event: NlProgressEvent) => void) | undefined,
  event: Omit<NlProgressEvent, 'timestamp'>
) {
  if (!onProgress) {
    return;
  }

  onProgress({
    ...event,
    timestamp: new Date().toISOString()
  });
}

function emitNlModelWork(
  onModelWork: ((event: NlModelWorkEvent) => void) | undefined,
  event:
    | Omit<NlModelWorkBlockStartedEvent, 'timestamp'>
    | Omit<NlModelWorkDeltaEvent, 'timestamp'>
    | Omit<NlModelWorkBlockCompletedEvent, 'timestamp'>
) {
  if (!onModelWork) {
    return;
  }

  onModelWork({
    ...event,
    timestamp: new Date().toISOString()
  });
}

function formatToolCallMarkdown(name: string, args: Record<string, unknown>): string {
  return [
    `**Tool:** \`${name}\``,
    '',
    '```json',
    JSON.stringify(args, null, 2),
    '```'
  ].join('\n');
}

function formatInlineList(items: string[], emptyCopy: string): string {
  return items.length > 0 ? items.join('; ') : emptyCopy;
}

function formatJoinPlanMarkdown(joinPlan: Pass1JoinPlanItem[]): string {
  return formatInlineList(
    joinPlan.map((join) => (
      `\`${join.leftTable}.${join.leftColumn}\` -> \`${join.rightTable}.${join.rightColumn}\` `
      + `(${join.joinType}, ${Math.round(clampConfidence(join.confidence) * 100)}%)`
    )),
    'No join steps were needed.'
  );
}

function formatSchemaContextMarkdown(params: {
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

function formatPlanningMarkdown(planning: z.infer<typeof PASS1_SCHEMA>): string {
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

function formatSqlGenerationMarkdown(execution: {
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

function formatValidationMarkdown(notes: string[]): string {
  return `**Validation:** ${formatInlineList(notes, 'No validation notes were reported.')}`;
}

function formatRepairMarkdown(params: {
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

function createModelWorkBlock(params: {
  onModelWork?: (event: NlModelWorkEvent) => void;
  phaseId: NlProgressPhaseId;
  kind: NlModelWorkKind;
  title: string;
  details?: Record<string, unknown>;
  provider?: NlProviderInfo;
}) {
  let started = false;
  let completed = false;
  const blockId = randomUUID();

  const withProviderDetails = (details?: Record<string, unknown>) => ({
    ...(params.details ?? {}),
    ...(details ?? {}),
    provider: params.provider
  });

  return {
    blockId,
    start(details?: Record<string, unknown>) {
      if (started || completed) {
        return;
      }
      started = true;
      emitNlModelWork(params.onModelWork, {
        type: 'model_work_block_started',
        blockId,
        phaseId: params.phaseId,
        kind: params.kind,
        title: params.title,
        details: withProviderDetails(details)
      });
    },
    delta(content: string, details?: Record<string, unknown>) {
      if (completed || !content.trim()) {
        return;
      }
      if (!started) {
        this.start();
      }
      emitNlModelWork(params.onModelWork, {
        type: 'model_work_delta',
        blockId,
        phaseId: params.phaseId,
        kind: params.kind,
        title: params.title,
        delta: content,
        details: withProviderDetails(details)
      });
    },
    complete(details?: Record<string, unknown>, status: 'completed' | 'failed' = 'completed') {
      if (completed || !started) {
        return;
      }
      completed = true;
      emitNlModelWork(params.onModelWork, {
        type: 'model_work_block_completed',
        blockId,
        phaseId: params.phaseId,
        kind: params.kind,
        title: params.title,
        details: withProviderDetails(details),
        status
      });
    }
  };
}

async function requestStructuredJson<T extends z.ZodTypeAny>(params: {
  client: LlmClient;
  systemPrompt: string;
  userPrompt: string;
  schema: T;
  label: string;
  normalize?: (value: unknown) => unknown;
  maxOutputTokens?: number;
  reasoningEffort?: LlmReasoningEffort;
  modelWork?: {
    onModelWork?: (event: NlModelWorkEvent) => void;
    phaseId: NlProgressPhaseId;
    kind: NlModelWorkKind;
    title: string;
    provider?: NlProviderInfo;
    formatResult?: (value: z.infer<T>) => string;
  };
}): Promise<z.infer<T>> {
  let lastError: Error | null = null;
  let previousRaw = '';
  const modelWork = params.modelWork;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const messages: LlmMessage[] = [
      { role: 'system' as const, content: params.systemPrompt },
      { role: 'user' as const, content: params.userPrompt }
    ];

    if (attempt === 2 && previousRaw) {
      messages.push({ role: 'assistant' as const, content: previousRaw });
      messages.push({
        role: 'user' as const,
        content: `The previous ${params.label} response was invalid. Return only raw JSON matching the required schema. Do not include markdown, prose, code fences, or backticks.`
      });
    }

    let raw = '';
    let mainBlock: ReturnType<typeof createModelWorkBlock> | null = null;
    let thinkingBlock: ReturnType<typeof createModelWorkBlock> | null = null;
    try {
      const requestPayload = {
        messages,
        temperature: attempt === 1 ? 0.1 : 0,
        maxOutputTokens: params.maxOutputTokens ?? 2048,
        responseMimeType: 'application/json' as const,
        reasoningEffort: params.reasoningEffort,
        contextId: `${params.label}-${attempt}`
      };

      if (modelWork?.onModelWork) {
        thinkingBlock = createModelWorkBlock({
          onModelWork: modelWork.onModelWork,
          phaseId: modelWork.phaseId,
          kind: 'thinking',
          title: `${modelWork.title} thinking`,
          provider: modelWork.provider
        });

        raw = await params.client.stream(requestPayload, {
          onToken: () => {},
          onThinking: (text) => {
            thinkingBlock?.delta(text);
          },
          onToolCall: (call) => {
            const toolBlock = createModelWorkBlock({
              onModelWork: modelWork.onModelWork,
              phaseId: modelWork.phaseId,
              kind: 'tool',
              title: `Tool call: ${call.name}`,
              provider: modelWork.provider
            });
            toolBlock.delta(formatToolCallMarkdown(call.name, call.args), {
              thoughtSignature: call.thoughtSignature
            });
            toolBlock.complete();
          }
        });

        thinkingBlock.complete();
      } else {
        raw = await params.client.complete(requestPayload);
      }
    } catch (error) {
      if (thinkingBlock) {
        thinkingBlock.complete({
          error: summarizeError(error)
        }, 'failed');
      }
      lastError = toStructuredRequestError(params.label, error);
      // Provider/network failures should fail fast into higher-level fallback logic.
      break;
    }

    previousRaw = raw;

    try {
      const parsedJson = extractJson(raw);
      const normalizedJson = params.normalize ? params.normalize(parsedJson) : parsedJson;
      const validated = params.schema.safeParse(normalizedJson);
      if (validated.success) {
        if (modelWork?.onModelWork) {
          mainBlock = createModelWorkBlock({
            onModelWork: modelWork.onModelWork,
            phaseId: modelWork.phaseId,
            kind: modelWork.kind,
            title: modelWork.title,
            provider: modelWork.provider
          });
          const content = modelWork.formatResult
            ? modelWork.formatResult(validated.data)
            : JSON.stringify(validated.data, null, 2);
          mainBlock.delta(content, { attempt });
          mainBlock.complete({ attempt });
        }
        return validated.data;
      }
      lastError = new Error(
        `${params.label} validation failed: ${validated.error.issues.map((issue) => issue.message).join('; ')}`
      );
    } catch (error) {
      lastError = toStructuredRequestError(params.label, error);
      if (isTimeoutLikeError(lastError)) {
        break;
      }
    }

    console.warn(`[nlToSqlV2] ${params.label} attempt ${attempt} returned invalid structured output: ${summarizeError(lastError)}`);
  }

  throw lastError ?? new Error(`Failed to produce valid ${params.label} JSON.`);
}

async function buildSchemaContext(
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

function formatTableContextForPrompt(
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

function buildCaseSensitiveIdentifierHint(tables: SchemaTableContext[]): string {
  const identifiers = Array.from(buildCaseSensitiveIdentifierLookup(tables).values())
    .map((identifier) => quoteIdentifier(identifier));
  if (identifiers.length === 0) {
    return 'Case-sensitive identifiers requiring double quotes: none.';
  }
  return `Case-sensitive identifiers requiring double quotes: ${identifiers.join(', ')}.`;
}

function buildHeuristicPlanning(params: {
  nlQuery: string;
  defaultTableName: string | null;
  tables: SchemaTableContext[];
}): z.infer<typeof PASS1_SCHEMA> {
  const table = chooseFallbackTable(params.tables, params.defaultTableName, params.nlQuery);
  return {
    intentSummary: params.nlQuery.trim(),
    selectedTables: [table.tableName],
    joinPlan: [],
    filters: [],
    aggregations: [],
    assumptions: [],
    confidence: 0.7
  };
}

function buildPass1Prompt(params: {
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

function buildPass2Prompt(params: {
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

function buildPass2FallbackPrompt(params: {
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

function findColumn(table: SchemaTableContext, candidates: string[]): string | null {
  const lookup = new Map(
    table.columns.map((column) => [column.name.toLowerCase(), column.name])
  );
  for (const candidate of candidates) {
    const exact = lookup.get(candidate.toLowerCase());
    if (exact) {
      return exact;
    }
  }
  return null;
}

function chooseFallbackTable(
  tables: SchemaTableContext[],
  defaultTableName: string | null,
  nlQuery: string
): SchemaTableContext {
  if (defaultTableName) {
    const defaultMatch = tables.find((table) => isTableNameMatch(table.tableName, defaultTableName));
    if (defaultMatch) {
      return defaultMatch;
    }
  }

  const queryTokens = nlQuery
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 2);
  const normalizedQuery = ` ${nlQuery.toLowerCase()} `;

  let best = tables[0];
  let bestScore = -1;
  for (const table of tables) {
    const tableName = table.tableName.toLowerCase();
    const sourceName = table.sourceFilename.replace(/\.[^/.]+$/, '').toLowerCase();
    const tableColumns = table.columns.map((column) => normalizeColumnName(column.name));
    const spaceColumnNames = tableColumns.map((column) => column.replace(/_/g, ' '));

    let score = queryTokens.reduce((acc, token) => {
      if (tableName.includes(token)) return acc + 3;
      if (sourceName.includes(token)) return acc + 2;
      return acc;
    }, 0);

    score += spaceColumnNames.reduce((acc, column) => {
      const token = ` ${column} `;
      return normalizedQuery.includes(token) ? acc + 2 : acc;
    }, 0);

    if (/(end of chapter|eoc|chapter score|chapter performance)/.test(normalizedQuery)) {
      if (tableColumns.includes('eoc')) {
        score += 8;
      }
      if (tableColumns.includes('n_correct') && tableColumns.includes('n_possible')) {
        score += 4;
      }
    }

    if (/(student|students|learner)/.test(normalizedQuery) && tableColumns.includes('student_id')) {
      score += 3;
    }

    if (/(perform|highest|top|best|rank|score)/.test(normalizedQuery)) {
      if (tableColumns.includes('n_correct') || tableColumns.includes('score') || tableColumns.includes('eoc')) {
        score += 3;
      }
    }

    if (score > bestScore) {
      best = table;
      bestScore = score;
    }
  }

  return best;
}

type DeterministicFallbackShape = 'ratio_ranking' | 'avg_by_entity' | 'scalar_avg' | 'generic';

function deterministicFallbackBaseConfidence(shape: DeterministicFallbackShape): number {
  switch (shape) {
    case 'ratio_ranking':
      return 0.68;
    case 'avg_by_entity':
      return 0.62;
    case 'scalar_avg':
      return 0.56;
    case 'generic':
    default:
      return 0.48;
  }
}

function deriveDeterministicFallbackConfidence(
  shape: DeterministicFallbackShape,
  hasProviderFailureReason: boolean
): number {
  const base = deterministicFallbackBaseConfidence(shape);
  const adjusted = hasProviderFailureReason ? base - 0.06 : base;
  return clampConfidence(Math.max(0.35, adjusted));
}

function buildDeterministicFallbackExecution(params: {
  nlQuery: string;
  planning: z.infer<typeof PASS1_SCHEMA>;
  tables: SchemaTableContext[];
  defaultTableName: string | null;
  fallbackReason?: string;
}): z.infer<typeof PASS2_SCHEMA> {
  const table = chooseFallbackTable(params.tables, params.defaultTableName, params.nlQuery);
  const quotedTable = quoteIdentifier(table.tableName);
  const queryLower = params.nlQuery.toLowerCase();

  const studentId = findColumn(table, ['student_id', 'user_id', 'id']);
  const nCorrect = findColumn(table, ['n_correct', 'correct', 'num_correct']);
  const nPossible = findColumn(table, ['n_possible', 'possible', 'num_possible', 'total_possible']);
  const score = findColumn(table, ['EOC', 'eoc', 'score', 'response', 'grade', 'points']);

  let sql = `SELECT * FROM ${quotedTable} LIMIT 100`;
  let rationale = `Used deterministic fallback query on ${table.tableName} because model generation timed out.`;
  let shape: DeterministicFallbackShape = 'generic';
  const fallbackAssumption = params.fallbackReason
    ? 'Model provider failed; deterministic fallback SQL was generated.'
    : 'Model generation timed out; deterministic fallback SQL was generated.';
  const assumptions = [
    ...params.planning.assumptions,
    fallbackAssumption
  ];

  const rankingIntent = /(highest|top|best|rank|perform)/.test(queryLower);
  const averagingIntent = /(average|avg|mean)/.test(queryLower);

  if (studentId && nCorrect && nPossible && rankingIntent) {
    const s = quoteIdentifier(studentId);
    const c = quoteIdentifier(nCorrect);
    const p = quoteIdentifier(nPossible);
    sql = [
      `SELECT ${s} AS student_id,`,
      `       SUM(${c}) AS total_correct,`,
      `       SUM(${p}) AS total_possible,`,
      `       SUM(${c})::double precision / NULLIF(SUM(${p}), 0) AS performance_score`,
      `FROM ${quotedTable}`,
      `GROUP BY ${s}`,
      'ORDER BY performance_score DESC',
      'LIMIT 100'
    ].join('\n');
    rationale = 'Ranked entities by correct/possible ratio using deterministic fallback.';
    shape = 'ratio_ranking';
  } else if (studentId && score && (rankingIntent || averagingIntent)) {
    const s = quoteIdentifier(studentId);
    const sc = quoteIdentifier(score);
    sql = [
      `SELECT ${s} AS student_id,`,
      `       AVG(${sc}::double precision) AS average_score`,
      `FROM ${quotedTable}`,
      `GROUP BY ${s}`,
      'ORDER BY average_score DESC',
      'LIMIT 100'
    ].join('\n');
    rationale = `Ranked entities by average ${score} using deterministic fallback.`;
    shape = 'avg_by_entity';
  } else if (score && averagingIntent) {
    const sc = quoteIdentifier(score);
    sql = `SELECT AVG(${sc}::double precision) AS average_score FROM ${quotedTable} LIMIT 1`;
    rationale = `Computed average ${score} using deterministic fallback.`;
    shape = 'scalar_avg';
  }

  const conciseFallbackValidationNote = params.fallbackReason
    ? 'Model provider failure triggered deterministic fallback SQL.'
    : 'Model timeout triggered deterministic fallback SQL.';
  const debugFallbackValidationNote = params.fallbackReason
    ? `debug: provider fallback detail: ${params.fallbackReason}`
    : null;

  return {
    sql,
    rationale,
    intentSummary: params.planning.intentSummary,
    selectedTables: params.planning.selectedTables.length > 0
      ? params.planning.selectedTables
      : [table.tableName],
    joinPlan: params.planning.joinPlan,
    filters: params.planning.filters,
    aggregations: params.planning.aggregations,
    assumptions,
    validationNotes: [
      conciseFallbackValidationNote,
      ...(debugFallbackValidationNote ? [debugFallbackValidationNote] : [])
    ],
    confidence: deriveDeterministicFallbackConfidence(shape, Boolean(params.fallbackReason))
  };
}

function buildRepairPrompt(params: {
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

function mergeExplanation(
  planning: z.infer<typeof PASS1_SCHEMA>,
  execution: z.infer<typeof PASS2_SCHEMA>,
  validateNotes: string[],
  confidenceMode: NlConfidenceMode
): NlExplanation {
  const selectedTables = Array.from(new Set([
    ...planning.selectedTables,
    ...execution.selectedTables
  ])).filter(Boolean);

  const joinPlan = (execution.joinPlan.length > 0 ? execution.joinPlan : planning.joinPlan)
    .map((join) => ({
      leftTable: join.leftTable,
      leftColumn: join.leftColumn,
      rightTable: join.rightTable,
      rightColumn: join.rightColumn,
      joinType: join.joinType,
      confidence: clampConfidence(join.confidence),
      reason: join.reason
    }));

  const assumptions = Array.from(new Set([
    ...planning.assumptions,
    ...execution.assumptions
  ])).filter(Boolean);

  const validationNotes = Array.from(new Set([
    ...execution.validationNotes,
    ...validateNotes
  ])).filter(Boolean);

  const confidence = clampConfidence(execution.confidence ?? planning.confidence);
  const warningLevel = deriveWarningLevel(
    confidence,
    assumptions,
    joinPlan,
    resolveWarnConfidenceThreshold()
  );
  const reliabilityTier = deriveReliabilityTier(confidenceMode, warningLevel);

  return {
    intentSummary: execution.intentSummary ?? planning.intentSummary,
    selectedTables,
    joinPlan,
    filters: execution.filters.length > 0 ? execution.filters : planning.filters,
    aggregations: execution.aggregations.length > 0 ? execution.aggregations : planning.aggregations,
    assumptions,
    validationNotes,
    confidence,
    warningLevel,
    confidenceMode,
    reliabilityTier
  };
}

export function createNl2SqlService(overrides: Partial<Nl2SqlServiceDeps> = {}) {
  const datasetRepository = overrides.datasetRepository ?? createDatasetRepository(env.datasetMetadataPath);
  const getClient = overrides.getClient ?? defaultGetClient;

  async function repairSqlFromExecutionErrorV2({
    projectId,
    nlQuery,
    failedSql,
    executionError,
    defaultTable,
    priorExplanation,
    onProgress,
    onModelWork
  }: RepairSqlV2Options): Promise<GeneratedSqlV2> {
    const model = env.nl2sqlModel || env.llmModel || getDefaultLlmModel();
    const provider = getNlProviderInfo(model);
    const defaultReasoningEffort = getDefaultReasoningEffortForModel(model);
    emitNlProgress(onProgress, {
      phaseId: 'repair',
      status: 'started',
      summary: 'Repairing generated SQL using database execution feedback.'
    });

    try {
      const { tables, defaultTableName } = await buildSchemaContext(
        datasetRepository,
        projectId,
        defaultTable
      );

      if (tables.length === 0) {
        throw new Error('No dataset schema is available for this project. Upload data before using English mode.');
      }

      const schemaContextBlock = createModelWorkBlock({
        onModelWork,
        phaseId: 'schema_context',
        kind: 'status',
        title: 'Schema context',
        provider
      });
      schemaContextBlock.delta(formatSchemaContextMarkdown({
        tables,
        defaultTableName,
        joinCandidates: []
      }));
      schemaContextBlock.complete();

      const client = getClient(model);

      const repaired = await requestStructuredJson({
        client,
        label: 'nl2sql_repair',
        schema: REPAIR_SCHEMA,
        normalize: normalizeRepairOutput,
        maxOutputTokens: 900,
        reasoningEffort: defaultReasoningEffort,
        systemPrompt: 'You are a senior SQL debugger. Return valid JSON only.',
        userPrompt: buildRepairPrompt({
          nlQuery: nlQuery.trim(),
          failedSql: failedSql.trim(),
          executionError: executionError.trim(),
          defaultTableName,
          tables
        }),
        modelWork: {
          onModelWork,
          phaseId: 'repair',
          kind: 'repair',
          title: 'SQL repair',
          provider,
          formatResult: (result) => formatSqlGenerationMarkdown({
            sql: result.sql,
            rationale: result.rationale,
            assumptions: result.assumptions,
            validationNotes: result.validationNotes,
            confidence: result.confidence
          })
        }
      });

      const validation = validateReadOnlySql(repaired.sql, {
        defaultLimit: env.sqlDefaultLimit,
        maxRows: env.sqlMaxRows
      });
      const caseNormalized = normalizeCaseSensitiveIdentifiers(validation.normalizedSql, tables);
      const caseNormalizationNote = buildCaseNormalizationValidationNote(caseNormalized.replacements);

      const selectedTables = priorExplanation?.selectedTables.length
        ? priorExplanation.selectedTables
        : (defaultTableName ? [defaultTableName] : []);
      const joinPlan = priorExplanation?.joinPlan ?? [];
      const filters = priorExplanation?.filters ?? [];
      const aggregations = priorExplanation?.aggregations ?? [];
      const assumptions = Array.from(new Set([
        ...(priorExplanation?.assumptions ?? []),
        ...repaired.assumptions
      ])).filter(Boolean);
      const validationNotes = Array.from(new Set([
        ...(priorExplanation?.validationNotes ?? []),
        ...repaired.validationNotes,
        ...(caseNormalizationNote ? [caseNormalizationNote] : []),
        `Auto-repaired after execution error: ${executionError.trim()}`
      ]));
      const confidence = clampConfidence(repaired.confidence ?? priorExplanation?.confidence ?? 0.6);
      const warningLevel = deriveWarningLevel(
        confidence,
        assumptions,
        joinPlan,
        resolveWarnConfidenceThreshold()
      );
      const confidenceMode: NlConfidenceMode = 'repair';
      const repairSummaryBlock = createModelWorkBlock({
        onModelWork,
        phaseId: 'repair',
        kind: 'repair',
        title: 'Repair summary',
        provider
      });
      repairSummaryBlock.delta(formatRepairMarkdown({
        sql: caseNormalized.sql,
        rationale: repaired.rationale,
        assumptions,
        validationNotes,
        confidence
      }));
      repairSummaryBlock.complete();

      emitNlProgress(onProgress, {
        phaseId: 'repair',
        status: 'completed',
        summary: 'Generated repaired SQL for review.'
      });

      return {
        sql: caseNormalized.sql,
        rationale: repaired.rationale,
        queryId: randomUUID(),
        provider,
        explanation: {
          intentSummary: priorExplanation?.intentSummary ?? 'Repaired SQL from execution error.',
          selectedTables,
          joinPlan,
          filters,
          aggregations,
          assumptions,
          validationNotes,
          confidence,
          warningLevel,
          confidenceMode,
          reliabilityTier: deriveReliabilityTier(confidenceMode, warningLevel)
        }
      };
    } catch (error) {
      emitNlProgress(onProgress, {
        phaseId: 'repair',
        status: 'failed',
        summary: `Repair failed: ${summarizeError(error)}`
      });
      throw error;
    }
  }

  async function generateSqlFromNaturalLanguageV2({
    projectId,
    nlQuery,
    defaultTable,
    onProgress,
    onModelWork
  }: GenerateSqlV2Options): Promise<GeneratedSqlV2> {
    const model = env.nl2sqlModel || env.llmModel || getDefaultLlmModel();
    const provider = getNlProviderInfo(model);
    const defaultReasoningEffort = getDefaultReasoningEffortForModel(model);
    const query = nlQuery.trim();
    if (!query) {
      throw new Error('Natural language query is required.');
    }

    emitNlProgress(onProgress, {
      phaseId: 'schema_context',
      status: 'started',
      summary: 'Building schema context from project datasets.'
    });

    let tables: SchemaTableContext[] = [];
    let defaultTableName: string | null = null;
    let joinCandidates: JoinCandidate[] = [];
    try {
      const schemaContext = await buildSchemaContext(
        datasetRepository,
        projectId,
        defaultTable
      );
      tables = schemaContext.tables;
      defaultTableName = schemaContext.defaultTableName;
      joinCandidates = schemaContext.joinCandidates;

      emitNlProgress(onProgress, {
        phaseId: 'schema_context',
        status: 'completed',
        summary: `Prepared schema context for ${tables.length} table${tables.length === 1 ? '' : 's'}.`
      });
      const schemaContextBlock = createModelWorkBlock({
        onModelWork,
        phaseId: 'schema_context',
        kind: 'status',
        title: 'Schema context',
        provider
      });
      schemaContextBlock.delta(formatSchemaContextMarkdown({
        tables,
        defaultTableName,
        joinCandidates
      }));
      schemaContextBlock.complete();
    } catch (error) {
      emitNlProgress(onProgress, {
        phaseId: 'schema_context',
        status: 'failed',
        summary: `Failed to build schema context: ${summarizeError(error)}`
      });
      throw error;
    }

    if (tables.length === 0) {
      throw new Error('No dataset schema is available for this project. Upload data before using English mode.');
    }

    const client = getClient(model);

    let planning: z.infer<typeof PASS1_SCHEMA>;
    let planningConfidenceMode: Extract<NlConfidenceMode, 'model' | 'heuristic'> = 'model';
    emitNlProgress(onProgress, {
      phaseId: 'planning',
      status: 'started',
      summary: 'Planning query intent, table selection, and join strategy.'
    });
    try {
      planning = await requestStructuredJson({
        client,
        label: 'nl2sql_plan',
        schema: PASS1_SCHEMA,
        normalize: normalizePass1Output,
        maxOutputTokens: 900,
        reasoningEffort: defaultReasoningEffort,
        systemPrompt: 'You are a senior analytics SQL planner. Return valid JSON only.',
        userPrompt: buildPass1Prompt({
          nlQuery: query,
          defaultTableName,
          tables,
          joinCandidates
        }),
        modelWork: {
          onModelWork,
          phaseId: 'planning',
          kind: 'plan',
          title: 'Query planning',
          provider,
          formatResult: formatPlanningMarkdown
        }
      });
      emitNlProgress(onProgress, {
        phaseId: 'planning',
        status: 'completed',
        summary: 'Model planning completed.'
      });
    } catch (error) {
      emitNlProgress(onProgress, {
        phaseId: 'planning',
        status: 'failed',
        summary: `Model planning failed: ${summarizeError(error)}`
      });
      planning = buildHeuristicPlanning({ nlQuery: query, defaultTableName, tables });
      planning.assumptions = [];
      planning.confidence = 0.58;
      planningConfidenceMode = 'heuristic';
      const planningFallbackBlock = createModelWorkBlock({
        onModelWork,
        phaseId: 'planning',
        kind: 'plan',
        title: 'Planning fallback',
        provider
      });
      planningFallbackBlock.delta([
        '### Planning recovery',
        'Model planning failed, so a schema-guided recovery plan was generated.',
        '',
        `- Reason: ${summarizeError(error)}`,
        `- Confidence: ${Math.round(planning.confidence * 100)}%`,
        '',
        formatPlanningMarkdown(planning)
      ].join('\n'));
      planningFallbackBlock.complete();
      emitNlProgress(onProgress, {
        phaseId: 'planning',
        status: 'completed',
        summary: 'Recovered with planning fallback.'
      });
    }

    let execution: z.infer<typeof PASS2_SCHEMA>;
    let confidenceMode: NlConfidenceMode = planningConfidenceMode;
    emitNlProgress(onProgress, {
      phaseId: 'sql_generation',
      status: 'started',
      summary: 'Generating SQL and explanation output.'
    });
    emitNlProgress(onProgress, {
      phaseId: 'sql_generation',
      status: 'progress',
      summary: 'Model SQL generation in progress.'
    });

    try {
      execution = await requestStructuredJson({
        client,
        label: 'nl2sql_result',
        schema: PASS2_SCHEMA,
        normalize: normalizePass2Output,
        maxOutputTokens: 1200,
        reasoningEffort: defaultReasoningEffort,
        systemPrompt: 'You are a senior SQL engineer. Return valid JSON only.',
        userPrompt: buildPass2Prompt({
          nlQuery: query,
          defaultTableName,
          tables,
          planning
        }),
        modelWork: {
          onModelWork,
          phaseId: 'sql_generation',
          kind: 'sql',
          title: 'SQL generation',
          provider,
          formatResult: formatSqlGenerationMarkdown
        }
      });
      emitNlProgress(onProgress, {
        phaseId: 'sql_generation',
        status: 'completed',
        summary: 'SQL generation completed.'
      });
    } catch (error) {
      emitNlProgress(onProgress, {
        phaseId: 'sql_generation',
        status: 'failed',
        summary: `Primary SQL generation failed: ${summarizeError(error)}`
      });
      if (isTimeoutLikeError(error) || isProviderFailureLikeError(error)) {
        execution = buildDeterministicFallbackExecution({
          nlQuery: query,
          planning,
          tables,
          defaultTableName,
          fallbackReason: isTimeoutLikeError(error)
            ? undefined
            : summarizeError(error)
        });
        confidenceMode = 'deterministic_fallback';
        const fallbackBlock = createModelWorkBlock({
          onModelWork,
          phaseId: 'sql_generation',
          kind: 'sql',
          title: 'Deterministic SQL fallback',
          provider
        });
        fallbackBlock.delta(formatSqlGenerationMarkdown(execution));
        fallbackBlock.complete();
        emitNlProgress(onProgress, {
          phaseId: 'sql_generation',
          status: 'completed',
          summary: 'Recovered with deterministic fallback SQL.'
        });
      } else {
        try {
          emitNlProgress(onProgress, {
            phaseId: 'sql_generation',
            status: 'progress',
            summary: 'Retrying with compact SQL generation fallback.'
          });
          const compact = await requestStructuredJson({
            client,
            label: 'nl2sql_result_compact',
            schema: PASS2_FALLBACK_SCHEMA,
            normalize: normalizePass2FallbackOutput,
            maxOutputTokens: 700,
            reasoningEffort: normalizeReasoningSelection({
              modelId: model,
              enableThinking: false,
              thinkingLevel: 'low'
            }),
            systemPrompt: 'You are a senior SQL engineer. Return compact valid JSON only.',
            userPrompt: buildPass2FallbackPrompt({
              nlQuery: query,
              defaultTableName,
              tables,
              planning,
              recoveryReason: summarizeError(error)
            }),
            modelWork: {
              onModelWork,
              phaseId: 'sql_generation',
              kind: 'sql',
              title: 'Compact SQL fallback',
              provider,
              formatResult: formatSqlGenerationMarkdown
            }
          });

          execution = {
            sql: compact.sql,
            rationale: compact.rationale,
            intentSummary: planning.intentSummary,
            selectedTables: planning.selectedTables,
            joinPlan: planning.joinPlan,
            filters: planning.filters,
            aggregations: planning.aggregations,
            assumptions: Array.from(new Set([
              ...planning.assumptions,
              ...compact.assumptions,
              `Recovered with compact fallback after rich SQL generation failed: ${summarizeError(error)}`
            ])),
            validationNotes: [
              `compact fallback generated the final SQL after rich output validation failed: ${summarizeError(error)}`
            ],
            confidence: compact.confidence
          };
          emitNlProgress(onProgress, {
            phaseId: 'sql_generation',
            status: 'completed',
            summary: 'Recovered with compact SQL generation.'
          });
        } catch (compactError) {
          console.warn('[nlToSqlV2] Compact SQL fallback failed; using deterministic fallback instead.', {
            error: summarizeError(compactError)
          });
          execution = buildDeterministicFallbackExecution({
            nlQuery: query,
            planning,
            tables,
            defaultTableName,
            fallbackReason: isTimeoutLikeError(compactError)
              ? undefined
              : summarizeError(compactError)
          });
          confidenceMode = 'deterministic_fallback';
          const fallbackBlock = createModelWorkBlock({
            onModelWork,
            phaseId: 'sql_generation',
            kind: 'sql',
            title: 'Deterministic SQL fallback',
            provider
          });
          fallbackBlock.delta(formatSqlGenerationMarkdown(execution));
          fallbackBlock.complete();
          emitNlProgress(onProgress, {
            phaseId: 'sql_generation',
            status: 'completed',
            summary: 'Recovered with deterministic fallback SQL.'
          });
        }
      }
    }

    emitNlProgress(onProgress, {
      phaseId: 'validation',
      status: 'started',
      summary: 'Validating SQL safety and normalization rules.'
    });
    const validationBlock = createModelWorkBlock({
      onModelWork,
      phaseId: 'validation',
      kind: 'validation',
      title: 'SQL validation',
      provider
    });
    validationBlock.delta([
      '### Validation checks',
      '- Verifying read-only SQL safety.',
      `- Enforcing LIMIT ${env.sqlDefaultLimit} when needed.`,
      '- Normalizing case-sensitive identifiers.'
    ].join('\n'));

    try {
      const validation = validateReadOnlySql(execution.sql, {
        defaultLimit: env.sqlDefaultLimit,
        maxRows: env.sqlMaxRows
      });
      const caseNormalized = normalizeCaseSensitiveIdentifiers(validation.normalizedSql, tables);

      const validateNotes = [
        validation.limitAppended
          ? `LIMIT was automatically appended (${env.sqlDefaultLimit}) for read-only safety.`
          : 'SQL passed read-only validation checks.'
      ];
      const caseNormalizationNote = buildCaseNormalizationValidationNote(caseNormalized.replacements);
      if (caseNormalizationNote) {
        validateNotes.push(caseNormalizationNote);
      }
      validationBlock.delta(`\n\n${formatValidationMarkdown(validateNotes)}`);
      validationBlock.complete();

      const explanation = mergeExplanation(planning, execution, validateNotes, confidenceMode);
      emitNlProgress(onProgress, {
        phaseId: 'validation',
        status: 'completed',
        summary: 'Validation completed.'
      });

      return {
        sql: caseNormalized.sql,
        rationale: execution.rationale,
        queryId: randomUUID(),
        provider,
        explanation
      };
    } catch (error) {
      validationBlock.delta([
        '',
        '',
        '### Validation failure',
        `- ${summarizeError(error)}`
      ].join('\n'));
      validationBlock.complete(undefined, 'failed');
      emitNlProgress(onProgress, {
        phaseId: 'validation',
        status: 'failed',
        summary: `Validation failed: ${summarizeError(error)}`
      });
      throw error;
    }
  }

  return {
    generateSqlFromNaturalLanguageV2,
    repairSqlFromExecutionErrorV2
  };
}

const defaultNl2SqlService = createNl2SqlService();

export async function generateSqlFromNaturalLanguageV2(
  options: GenerateSqlV2Options
): Promise<GeneratedSqlV2> {
  return defaultNl2SqlService.generateSqlFromNaturalLanguageV2(options);
}

export async function repairSqlFromExecutionErrorV2(
  options: RepairSqlV2Options
): Promise<GeneratedSqlV2> {
  return defaultNl2SqlService.repairSqlFromExecutionErrorV2(options);
}

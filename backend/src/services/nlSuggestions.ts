import { createHash } from 'node:crypto';

import { z } from 'zod';

import { env } from '../config.js';
import { createDatasetRepository, type DatasetRepository } from '../repositories/datasetRepository.js';
import type { DatasetProfile } from '../types/dataset.js';
import { createLlmClient, type LlmClient, type LlmMessage } from './llm/llmClient.js';

const DEFAULT_SUGGESTION_COUNT = 8;
const MAX_TABLES_IN_PROMPT = 24;
const MAX_COLUMNS_PER_TABLE = 18;
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface NlSuggestion {
  id: string;
  prompt: string;
  label: string;
  category: string;
  tables: string[];
  rationale: string;
}

export interface GetNlSuggestionsOptions {
  projectId: string;
  limit?: number;
}

interface NlSuggestionCacheEntry {
  expiresAt: number;
  suggestions: NlSuggestion[];
}

interface SchemaColumnSummary {
  name: string;
  dtype: string;
}

interface SchemaTableSummary {
  tableName: string;
  sourceFilename: string;
  rowCount: number;
  columns: SchemaColumnSummary[];
}

interface RelationshipHint {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  strength: number;
  reason: string;
}

interface NlSuggestionServiceDeps {
  datasetRepository: DatasetRepository;
  getClient: (model: string) => LlmClient;
  now: () => number;
  cacheTtlMs: number;
}

const SUGGESTION_SCHEMA = z.object({
  suggestions: z.array(
    z.object({
      prompt: z.string().min(20).max(240),
      label: z.string().min(6).max(80),
      category: z.string().min(3).max(40),
      tables: z.array(z.string().min(1)).min(1).max(4),
      rationale: z.string().min(12).max(180)
    })
  ).min(4).max(12)
});

const suggestionCache = new Map<string, NlSuggestionCacheEntry>();

function normalizeTableName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
}

function fallbackTableName(filename: string, datasetId: string): string {
  const baseName = filename.replace(/\.[^/.]+$/, '');
  let safe = baseName
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

function normalizeColumnType(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed || 'unknown';
}

function buildSchemaSummary(datasets: DatasetProfile[], projectId: string): SchemaTableSummary[] {
  return datasets
    .filter((dataset) => dataset.projectId === projectId)
    .map((dataset) => {
      const metadata = dataset.metadata && typeof dataset.metadata === 'object'
        ? dataset.metadata as Record<string, unknown>
        : {};
      const metadataTableName = typeof metadata.tableName === 'string' ? metadata.tableName : '';

      return {
        tableName: normalizeTableName(metadataTableName) || fallbackTableName(dataset.filename, dataset.datasetId),
        sourceFilename: dataset.filename,
        rowCount: dataset.nRows,
        columns: dataset.columns
          .slice(0, MAX_COLUMNS_PER_TABLE)
          .map((column) => ({
            name: column.name,
            dtype: normalizeColumnType(column.dtype)
          }))
      } satisfies SchemaTableSummary;
    })
    .slice(0, MAX_TABLES_IN_PROMPT);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function inferRelationshipHints(tables: SchemaTableSummary[]): RelationshipHint[] {
  const hints: RelationshipHint[] = [];

  for (let leftIndex = 0; leftIndex < tables.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < tables.length; rightIndex += 1) {
      if (leftIndex === rightIndex) {
        continue;
      }

      const leftTable = tables[leftIndex];
      const rightTable = tables[rightIndex];
      const rightColumns = new Map(
        rightTable.columns.map((column) => [normalizeToken(column.name), column.name])
      );
      const rightTableToken = normalizeToken(rightTable.tableName).replace(/s$/, '');
      const rightId = rightColumns.get('id');

      for (const leftColumn of leftTable.columns) {
        const leftToken = normalizeToken(leftColumn.name);

        if (leftToken.endsWith('_id') && rightId) {
          const targetToken = leftToken.slice(0, -3);
          if (
            targetToken === rightTableToken
            || targetToken === normalizeToken(rightTable.tableName)
            || normalizeToken(rightTable.tableName).includes(targetToken)
          ) {
            hints.push({
              fromTable: leftTable.tableName,
              fromColumn: leftColumn.name,
              toTable: rightTable.tableName,
              toColumn: rightId,
              strength: 0.86,
              reason: `Foreign-key style match from ${leftColumn.name} to ${rightTable.tableName}.id`
            });
          }
        }

        const exactRightColumn = rightColumns.get(leftToken);
        if (exactRightColumn && leftToken !== 'id' && leftToken.endsWith('_id')) {
          hints.push({
            fromTable: leftTable.tableName,
            fromColumn: leftColumn.name,
            toTable: rightTable.tableName,
            toColumn: exactRightColumn,
            strength: 0.7,
            reason: `Both tables expose ${leftColumn.name}, suggesting a shared entity key.`
          });
        }
      }
    }
  }

  const deduped = new Map<string, RelationshipHint>();
  for (const hint of hints) {
    const key = `${hint.fromTable}|${hint.fromColumn}|${hint.toTable}|${hint.toColumn}`;
    const existing = deduped.get(key);
    if (!existing || hint.strength > existing.strength) {
      deduped.set(key, hint);
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 16);
}

function buildSchemaFingerprint(tables: SchemaTableSummary[]): string {
  const payload = tables
    .map((table) => ({
      tableName: table.tableName,
      rowCount: table.rowCount,
      columns: table.columns.map((column) => `${column.name}:${column.dtype}`)
    }))
    .sort((left, right) => left.tableName.localeCompare(right.tableName));

  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

function buildPrompt(params: {
  projectId: string;
  limit: number;
  tables: SchemaTableSummary[];
  relationships: RelationshipHint[];
}): string {
  const tableSummary = params.tables.map((table) => (
    `- ${table.tableName} (${table.rowCount} rows, source ${table.sourceFilename}): ${table.columns
      .map((column) => `${column.name}:${column.dtype}`)
      .join(', ')}`
  )).join('\n');

  const relationshipSummary = params.relationships.length > 0
    ? params.relationships
      .map((hint) => (
        `- ${hint.fromTable}.${hint.fromColumn} -> ${hint.toTable}.${hint.toColumn} `
        + `(strength ${hint.strength.toFixed(2)}): ${hint.reason}`
      ))
      .join('\n')
    : '- None inferred.';

  return [
    'Generate schema-aware natural-language query suggestions for an analytics query builder.',
    `Return exactly ${params.limit} suggestions in JSON only.`,
    'Each suggestion must feel like a real analyst request, not a toy example.',
    'Prefer diverse analytical intents: segmentation, trend analysis, top-N, funnel/rate analysis, cohorting, exceptions, and joined summaries.',
    'Do not include trivial prompts like "show all rows", "count rows", or "list data".',
    'Use only the tables and columns that exist in the schema below.',
    'If you imply a join, base it on the relationship hints and mention the business framing naturally.',
    'Each prompt should be a single sentence, detailed enough for direct execution, and concrete about dimensions, metrics, filters, or time windows when the schema supports them.',
    'Return JSON with one top-level key: suggestions.',
    'Each suggestion item must contain: prompt, label, category, tables, rationale.',
    `Project id: ${params.projectId}`,
    'Schema:',
    tableSummary || '- None.',
    'Relationship hints:',
    relationshipSummary
  ].join('\n');
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Suggestion model returned an empty response.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fenced parsing.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error('Suggestion response did not contain valid JSON.');
}

function normalizeSuggestionId(prompt: string, index: number): string {
  const base = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'suggestion'}-${index + 1}`;
}

function normalizeSuggestions(raw: z.infer<typeof SUGGESTION_SCHEMA>, limit: number): NlSuggestion[] {
  const seen = new Set<string>();
  const normalized: NlSuggestion[] = [];

  for (const [index, suggestion] of raw.suggestions.entries()) {
    const prompt = suggestion.prompt.trim().replace(/\s+/g, ' ');
    const promptKey = prompt.toLowerCase();
    if (!prompt || seen.has(promptKey)) {
      continue;
    }

    seen.add(promptKey);
    normalized.push({
      id: normalizeSuggestionId(prompt, index),
      prompt,
      label: suggestion.label.trim(),
      category: suggestion.category.trim(),
      tables: Array.from(new Set(suggestion.tables.map((table) => table.trim()).filter(Boolean))),
      rationale: suggestion.rationale.trim()
    });

    if (normalized.length >= limit) {
      break;
    }
  }

  if (normalized.length === 0) {
    throw new Error('Suggestion model returned no usable suggestions.');
  }

  return normalized;
}

function isNumericLikeColumn(column: SchemaColumnSummary): boolean {
  const dtype = column.dtype.toLowerCase();
  const name = column.name.toLowerCase();
  return /(int|float|double|decimal|numeric|real|number)/.test(dtype)
    || /(amount|revenue|score|count|total|value|price|points|rate|percent|pct|n_correct|n_possible|response|eoc)/.test(name);
}

function isTimeLikeColumn(column: SchemaColumnSummary): boolean {
  const dtype = column.dtype.toLowerCase();
  const name = column.name.toLowerCase();
  return /(date|time|timestamp)/.test(dtype)
    || /(date|time|timestamp|created_at|updated_at|day|week|month|year)/.test(name);
}

function findColumn(table: SchemaTableSummary, matcher: (column: SchemaColumnSummary) => boolean): SchemaColumnSummary | null {
  return table.columns.find(matcher) ?? null;
}

function findDimensionColumn(table: SchemaTableSummary): SchemaColumnSummary | null {
  return table.columns.find((column) => {
    const name = column.name.toLowerCase();
    if (isNumericLikeColumn(column) || isTimeLikeColumn(column)) {
      return false;
    }
    return /(category|type|status|segment|group|class|institution|book|release|chapter|page|region|country|state)/.test(name);
  }) ?? table.columns.find((column) => {
    const name = column.name.toLowerCase();
    return !isNumericLikeColumn(column) && !isTimeLikeColumn(column) && !/^(id|.*_id)$/.test(name);
  }) ?? null;
}

function buildSuggestion(
  prompt: string,
  label: string,
  category: string,
  tables: string[],
  rationale: string,
  index: number
): NlSuggestion {
  return {
    id: normalizeSuggestionId(prompt, index),
    prompt,
    label,
    category,
    tables,
    rationale
  };
}

function buildDeterministicSuggestions(params: {
  tables: SchemaTableSummary[];
  relationships: RelationshipHint[];
  limit: number;
}): NlSuggestion[] {
  const primaryTable = params.tables
    .slice()
    .sort((left, right) => right.rowCount - left.rowCount)[0];
  if (!primaryTable) {
    return [];
  }

  const primaryMetric = findColumn(primaryTable, isNumericLikeColumn);
  const primaryTime = findColumn(primaryTable, isTimeLikeColumn);
  const primaryDimension = findDimensionColumn(primaryTable);
  const ratioNumerator = findColumn(primaryTable, (column) => column.name.toLowerCase() === 'n_correct');
  const ratioDenominator = findColumn(primaryTable, (column) => column.name.toLowerCase() === 'n_possible');
  const joinHint = params.relationships[0];
  const joinedTable = joinHint
    ? params.tables.find((table) => table.tableName === joinHint.toTable) ?? null
    : null;
  const joinedDimension = joinedTable ? findDimensionColumn(joinedTable) : null;

  const suggestions: Array<Omit<NlSuggestion, 'id'>> = [];

  if (ratioNumerator && ratioDenominator) {
    suggestions.push({
      prompt: `Show the top 20 ${joinHint?.fromColumn ?? 'student_id'} values in ${primaryTable.tableName} by ${ratioNumerator.name} divided by ${ratioDenominator.name}, including only rows where ${ratioDenominator.name} is greater than 0.`,
      label: 'Top performance ratios',
      category: 'ranking',
      tables: [primaryTable.tableName],
      rationale: `Uses ${ratioNumerator.name} and ${ratioDenominator.name} from ${primaryTable.tableName} to create a meaningful ranked performance view.`
    });
  }

  if (primaryMetric && primaryTime) {
    suggestions.push({
      prompt: `Plot the trend of ${primaryMetric.name} over ${primaryTime.name} from ${primaryTable.tableName}, grouped by time period and ordered chronologically.`,
      label: 'Metric trend over time',
      category: 'trend',
      tables: [primaryTable.tableName],
      rationale: `Combines the time column ${primaryTime.name} with the metric ${primaryMetric.name} to produce a realistic trend analysis.`
    });
  }

  if (primaryMetric && primaryDimension) {
    suggestions.push({
      prompt: `Break down average ${primaryMetric.name} by ${primaryDimension.name} in ${primaryTable.tableName}, sorted from highest to lowest average.`,
      label: 'Dimension breakdown',
      category: 'segmentation',
      tables: [primaryTable.tableName],
      rationale: `Uses ${primaryDimension.name} as a business dimension and ${primaryMetric.name} as the metric for a useful grouped summary.`
    });
  }

  if (joinHint && joinedTable) {
    suggestions.push({
      prompt: `Join ${joinHint.fromTable} with ${joinHint.toTable} on ${joinHint.fromColumn} and ${joinHint.toColumn}, then summarize row counts${joinedDimension ? ` by ${joinedTable.tableName}.${joinedDimension.name}` : ''}.`,
      label: 'Joined relationship summary',
      category: 'join-analysis',
      tables: [joinHint.fromTable, joinHint.toTable],
      rationale: `Uses an inferred relationship between ${joinHint.fromTable} and ${joinHint.toTable} so the query builder shows a schema-aware multi-table analysis.`
    });
  }

  suggestions.push({
    prompt: `Find the most common records in ${primaryTable.tableName}${primaryDimension ? ` by ${primaryDimension.name}` : ''} and return the top 20 groups by row count.`,
    label: 'Most common groups',
    category: 'ranking',
    tables: [primaryTable.tableName],
    rationale: `Provides a safe default exploration pattern grounded in ${primaryTable.tableName}.`
  });

  suggestions.push({
    prompt: `Show rows from ${primaryTable.tableName} where key fields${primaryMetric ? ` like ${primaryMetric.name}` : ''}${primaryDimension ? ` and ${primaryDimension.name}` : ''} are null or missing, ordered by frequency.`,
    label: 'Missing data audit',
    category: 'quality',
    tables: [primaryTable.tableName],
    rationale: `Covers a practical data-quality question using the available columns in ${primaryTable.tableName}.`
  });

  const normalized = normalizeSuggestions({
    suggestions: suggestions.map((suggestion) => ({
      prompt: suggestion.prompt,
      label: suggestion.label,
      category: suggestion.category,
      tables: suggestion.tables,
      rationale: suggestion.rationale
    }))
  }, params.limit);

  return normalized.map((suggestion, index) => buildSuggestion(
    suggestion.prompt,
    suggestion.label,
    suggestion.category,
    suggestion.tables,
    suggestion.rationale,
    index
  ));
}

async function requestSuggestions(params: {
  client: LlmClient;
  prompt: string;
  limit: number;
}): Promise<NlSuggestion[]> {
  const messages: LlmMessage[] = [
    { role: 'system', content: 'You are a senior analytics assistant. Return valid JSON only.' },
    { role: 'user', content: params.prompt }
  ];

  const raw = await params.client.complete({
    messages,
    temperature: 0.5,
    maxOutputTokens: 1400,
    responseMimeType: 'application/json'
  });

  const parsed = SUGGESTION_SCHEMA.parse(extractJson(raw));
  return normalizeSuggestions(parsed, params.limit);
}

export function createNlSuggestionsService(overrides: Partial<NlSuggestionServiceDeps> = {}) {
  const datasetRepository = overrides.datasetRepository ?? createDatasetRepository(env.datasetMetadataPath);
  const getClient = overrides.getClient ?? ((model: string) => createLlmClient(model, env.nl2sqlTimeoutMs || env.llmTimeoutMs));
  const now = overrides.now ?? (() => Date.now());
  const cacheTtlMs = overrides.cacheTtlMs ?? CACHE_TTL_MS;

  async function getSuggestions({
    projectId,
    limit = DEFAULT_SUGGESTION_COUNT
  }: GetNlSuggestionsOptions): Promise<{ suggestions: NlSuggestion[]; cached: boolean; schemaFingerprint: string }> {
    const datasets = await datasetRepository.list();
    const tables = buildSchemaSummary(datasets, projectId);

    if (tables.length === 0) {
      throw new Error('No dataset schema is available for this project. Upload data before requesting suggestions.');
    }

    const schemaFingerprint = buildSchemaFingerprint(tables);
    const cacheKey = `${projectId}:${schemaFingerprint}:${Math.max(1, Math.min(limit, DEFAULT_SUGGESTION_COUNT + 4))}`;
    const cached = suggestionCache.get(cacheKey);
    const timestamp = now();

    if (cached && cached.expiresAt > timestamp) {
      return {
        suggestions: cached.suggestions.slice(0, limit),
        cached: true,
        schemaFingerprint
      };
    }

    const model = env.nl2sqlModel || env.llmModel;
    const client = getClient(model);
    const relationships = inferRelationshipHints(tables);
    let suggestions: NlSuggestion[];
    try {
      suggestions = await requestSuggestions({
        client,
        prompt: buildPrompt({
          projectId,
          limit,
          tables,
          relationships
        }),
        limit
      });
    } catch (error) {
      console.warn('[nlSuggestions] Model suggestion generation failed, using deterministic schema-aware fallback.', {
        error: error instanceof Error ? error.message : String(error),
        projectId
      });
      suggestions = buildDeterministicSuggestions({
        tables,
        relationships,
        limit
      });
    }

    suggestionCache.set(cacheKey, {
      suggestions,
      expiresAt: timestamp + cacheTtlMs
    });

    return {
      suggestions,
      cached: false,
      schemaFingerprint
    };
  }

  return {
    getSuggestions
  };
}

const defaultNlSuggestionsService = createNlSuggestionsService();

export async function getNaturalLanguageSuggestions(options: GetNlSuggestionsOptions) {
  return defaultNlSuggestionsService.getSuggestions(options);
}

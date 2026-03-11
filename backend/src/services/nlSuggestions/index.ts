import { env } from '../../config.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createLlmClient, type LlmClient, type LlmMessage } from '../llm/llmClient.js';
import { extractJson } from '../nlToSql/jsonNormalization.js';

import { getCacheEntry, setCacheEntry } from './cache.js';
import { inferRelationshipHints } from './relationshipHints.js';
import {
  buildSchemaFingerprint,
  buildSchemaSummary,
  findColumn,
  findDimensionColumn,
  isNumericLikeColumn,
  isTimeLikeColumn
} from './schemaBuilder.js';
import {
  buildSuggestion,
  normalizeSuggestions,
  SUGGESTION_SCHEMA
} from './suggestionParser.js';
import type {
  GetNlSuggestionsOptions,
  NlSuggestion,
  NlSuggestionServiceDeps,
  RelationshipHint,
  SchemaTableSummary
} from './types.js';

export type { GetNlSuggestionsOptions, NlSuggestion } from './types.js';

const DEFAULT_SUGGESTION_COUNT = 8;
const CACHE_TTL_MS = 15 * 60 * 1000;

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
    const cached = getCacheEntry(cacheKey);
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

    setCacheEntry(cacheKey, {
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

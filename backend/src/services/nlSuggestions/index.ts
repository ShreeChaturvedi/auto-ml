import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createLlmClient, type LlmClient, type LlmMessage } from '../llm/llmClient.js';
import { extractJson } from '../nlToSql/jsonNormalization.js';

import { getCacheEntry, setCacheEntry } from './cache.js';
import { inferRelationshipHints } from './relationshipHints.js';
import {
  buildSchemaFingerprint,
  buildSchemaSummary
} from './schemaBuilder.js';
import {
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
const MAX_SUGGESTION_RETRIES = 2;

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

async function requestSuggestions(params: {
  client: LlmClient;
  projectId: string;
  prompt: string;
  limit: number;
}): Promise<NlSuggestion[]> {
  const messages: LlmMessage[] = [
    { role: 'system', content: 'You are a senior analytics assistant. Return valid JSON only.' },
    { role: 'user', content: params.prompt }
  ];

  const maxAttempts = MAX_SUGGESTION_RETRIES + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const raw = await params.client.complete({
        messages,
        temperature: 0.5,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      });

      const parsed = SUGGESTION_SCHEMA.parse(extractJson(raw));
      return normalizeSuggestions(parsed, params.limit);
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        appLogger.warn(`[nlSuggestions] Attempt ${attempt + 1}/${maxAttempts} failed, retrying.`, {
          error: error instanceof Error ? error.message : String(error),
          projectId: params.projectId
        });
        await new Promise((resolve) => { setTimeout(resolve, 500 * (attempt + 1)); });
      } else {
        appLogger.error(`[nlSuggestions] All ${maxAttempts} attempts failed.`, {
          error: error instanceof Error ? error.message : String(error),
          projectId: params.projectId
        });
        throw error;
      }
    }
  }

  /* istanbul ignore next -- unreachable, loop always returns or throws */
  throw new Error('Unexpected: retry loop exited without returning or throwing');
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
    const suggestions = await requestSuggestions({
      client,
      projectId,
      prompt: buildPrompt({
        projectId,
        limit,
        tables,
        relationships
      }),
      limit
    });

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

import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createNlSuggestionRepository } from '../../repositories/nlSuggestionRepository.js';
import { createLlmClient, type LlmClient, type LlmMessage } from '../llm/llmClient.js';
import { extractJson } from '../nlToSql/jsonNormalization.js';

import { inferRelationshipHints } from './relationshipHints.js';
import { buildSchemaFingerprint, buildSchemaSummary } from './schemaBuilder.js';
import { normalizeSuggestions, SUGGESTION_SCHEMA } from './suggestionParser.js';
import type {
  GetNlSuggestionsOptions,
  NlSuggestion,
  NlSuggestionServiceDeps,
  RelationshipHint,
  SchemaTableSummary
} from './types.js';

export type { GetNlSuggestionsOptions, NlSuggestion } from './types.js';

const DEFAULT_SUGGESTION_COUNT = 8;
const MAX_SUGGESTION_COUNT = 12;
const MAX_SUGGESTION_RETRIES = 2;
const SUGGESTION_PROMPT_VERSION = 1;

const inflightSuggestionGenerations = new Map<string, Promise<NlSuggestion[]>>();

function buildPrompt(params: {
  projectId: string;
  limit: number;
  tables: SchemaTableSummary[];
  relationships: RelationshipHint[];
}): string {
  const tableSummary = params.tables.map((table) => (
    `- ${table.tableName}: ${table.columns
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
    `Prompt version: ${SUGGESTION_PROMPT_VERSION}`,
    'Schema:',
    tableSummary || '- None.',
    'Relationship hints:',
    relationshipSummary
  ].join('\n');
}

function buildInflightKey(params: {
  projectId: string;
  schemaFingerprint: string;
  modelId: string;
  promptVersion: number;
}): string {
  return `${params.projectId}:${params.schemaFingerprint}:${params.modelId}:${params.promptVersion}`;
}

function isRetryableSuggestionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return [
    'timeout',
    'timed out',
    'rate limit',
    '429',
    '500',
    '502',
    '503',
    '504',
    'network',
    'econnreset',
    'etimedout',
    'temporarily unavailable'
  ].some((pattern) => message.includes(pattern));
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
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const raw = await params.client.complete({
        messages,
        maxOutputTokens: 1400,
        responseMimeType: 'application/json',
        reasoningEffort: 'low'
      });

      const parsed = SUGGESTION_SCHEMA.parse(extractJson(raw));
      return normalizeSuggestions(parsed, params.limit);
    } catch (error) {
      const shouldRetry = attempt < maxAttempts - 1 && isRetryableSuggestionError(error);
      if (shouldRetry) {
        appLogger.warn(`[nlSuggestions] Attempt ${attempt + 1}/${maxAttempts} failed, retrying.`, {
          error: error instanceof Error ? error.message : String(error),
          projectId: params.projectId
        });
        await new Promise((resolve) => { setTimeout(resolve, 500 * (attempt + 1)); });
        continue;
      }

      appLogger.error(`[nlSuggestions] Suggestion generation failed.`, {
        error: error instanceof Error ? error.message : String(error),
        projectId: params.projectId,
        attempt: attempt + 1
      });
      throw error;
    }
  }

  throw new Error('Unexpected: retry loop exited without returning or throwing');
}

export function createNlSuggestionsService(overrides: Partial<NlSuggestionServiceDeps> = {}) {
  const datasetRepository = overrides.datasetRepository ?? createDatasetRepository(env.datasetMetadataPath);
  const suggestionRepository = overrides.suggestionRepository ?? createNlSuggestionRepository(env.nlSuggestionCachePath);
  const getClient = overrides.getClient ?? ((model: string) => createLlmClient(model, env.nl2sqlTimeoutMs || env.llmTimeoutMs));

  async function getProjectTables(projectId: string) {
    const datasets = await datasetRepository.listByProject(projectId);
    return buildSchemaSummary(datasets, projectId);
  }

  async function getSuggestions({
    projectId,
    limit = DEFAULT_SUGGESTION_COUNT
  }: GetNlSuggestionsOptions): Promise<{ suggestions: NlSuggestion[]; cached: boolean; schemaFingerprint: string }> {
    const tables = await getProjectTables(projectId);

    if (tables.length === 0) {
      return {
        suggestions: [],
        cached: false,
        schemaFingerprint: ''
      };
    }

    const schemaFingerprint = buildSchemaFingerprint(tables);
    const modelId = env.nl2sqlModel || env.llmModel;
    const stored = await suggestionRepository.get({
      projectId,
      schemaFingerprint,
      modelId,
      promptVersion: SUGGESTION_PROMPT_VERSION
    });

    return {
      suggestions: stored?.suggestions.slice(0, limit) ?? [],
      cached: Boolean(stored),
      schemaFingerprint
    };
  }

  async function regenerateSuggestions({
    projectId,
    limit = DEFAULT_SUGGESTION_COUNT
  }: GetNlSuggestionsOptions): Promise<{ suggestions: NlSuggestion[]; cached: boolean; schemaFingerprint: string }> {
    const tables = await getProjectTables(projectId);

    if (tables.length === 0) {
      return {
        suggestions: [],
        cached: false,
        schemaFingerprint: ''
      };
    }

    const schemaFingerprint = buildSchemaFingerprint(tables);
    const modelId = env.nl2sqlModel || env.llmModel;
    const existing = await suggestionRepository.get({
      projectId,
      schemaFingerprint,
      modelId,
      promptVersion: SUGGESTION_PROMPT_VERSION
    });

    if (existing) {
      return {
        suggestions: existing.suggestions.slice(0, limit),
        cached: true,
        schemaFingerprint
      };
    }

    const inflightKey = buildInflightKey({
      projectId,
      schemaFingerprint,
      modelId,
      promptVersion: SUGGESTION_PROMPT_VERSION
    });

    const running = inflightSuggestionGenerations.get(inflightKey);
    if (running) {
      const suggestions = await running;
      return {
        suggestions: suggestions.slice(0, limit),
        cached: true,
        schemaFingerprint
      };
    }

    const generationPromise = (async () => {
      const client = getClient(modelId);
      const relationships = inferRelationshipHints(tables);
      const suggestions = await requestSuggestions({
        client,
        projectId,
        prompt: buildPrompt({
          projectId,
          limit: MAX_SUGGESTION_COUNT,
          tables,
          relationships
        }),
        limit: MAX_SUGGESTION_COUNT
      });

      await suggestionRepository.put({
        projectId,
        schemaFingerprint,
        modelId,
        promptVersion: SUGGESTION_PROMPT_VERSION,
        suggestions
      });

      return suggestions;
    })().finally(() => {
      inflightSuggestionGenerations.delete(inflightKey);
    });

    inflightSuggestionGenerations.set(inflightKey, generationPromise);

    const suggestions = await generationPromise;
    return {
      suggestions: suggestions.slice(0, limit),
      cached: false,
      schemaFingerprint
    };
  }

  return {
    getSuggestions,
    regenerateSuggestions
  };
}

const defaultNlSuggestionsService = createNlSuggestionsService();

export async function getNaturalLanguageSuggestions(options: GetNlSuggestionsOptions) {
  return defaultNlSuggestionsService.getSuggestions(options);
}

export async function regenerateNaturalLanguageSuggestions(options: GetNlSuggestionsOptions) {
  return defaultNlSuggestionsService.regenerateSuggestions(options);
}

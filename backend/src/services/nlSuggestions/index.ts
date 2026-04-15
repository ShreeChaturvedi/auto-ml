import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';
import { createDatasetRepository } from '../../repositories/datasetRepository.js';
import { createNlSuggestionRepository } from '../../repositories/nlSuggestionRepository.js';
import { ensureProjectDatasetSqlNames } from '../datasetSqlNames.js';
import { createLlmClient, type LlmClient, type LlmMessage } from '../llm/llmClient.js';
import { extractJson } from '../nlToSql/jsonNormalization.js';

import { inferRelationshipHints } from './relationshipHints.js';
import { buildSchemaFingerprint, buildSchemaSummary } from './schemaBuilder.js';
import { normalizeSuggestions, normalizeWorkflowPlaceholders, SUGGESTION_SCHEMA } from './suggestionParser.js';
import type {
  GetNlSuggestionsOptions,
  NlSuggestion,
  NlSuggestionServiceDeps,
  RelationshipHint,
  SchemaTableSummary,
  WorkflowPlaceholders
} from './types.js';

export type { GetNlSuggestionsOptions, NlSuggestion, WorkflowPlaceholders } from './types.js';

const DEFAULT_SUGGESTION_COUNT = 8;
const MAX_SUGGESTION_COUNT = 12;
const MAX_SUGGESTION_RETRIES = 2;
const SUGGESTION_PROMPT_VERSION = 5;

interface GenerationResult {
  suggestions: NlSuggestion[];
  workflowPlaceholders?: WorkflowPlaceholders;
}

export interface SuggestionResult {
  suggestions: NlSuggestion[];
  cached: boolean;
  schemaFingerprint: string;
  workflowPlaceholders?: WorkflowPlaceholders;
}

const inflightSuggestionGenerations = new Map<string, Promise<GenerationResult>>();

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
    'Return JSON with a top-level key: suggestions.',
    'Each suggestion item must contain: prompt, label, category, tables, rationale.',
    '',
    'Also generate placeholder prompts for three ML workflow phases.',
    'Each placeholder should sound like a natural request a data scientist would type, reference actual column or table names from the schema, start with an action verb, and be 8-15 words.',
    'Add a "workflowPlaceholders" key to your JSON response with three sub-keys:',
    '- "preprocessing": 4-5 placeholders about data cleaning, missing values, encoding, or scaling.',
    '- "featureEngineering": 4-5 placeholders about feature creation, interactions, or selection.',
    '- "training": 4-5 placeholders about model selection, training, evaluation, or comparison.',
    '- "explore": exactly 10 valid, executable SQL SELECT queries using actual table and column names from the schema. Each query must be runnable as-is against the tables and columns defined above. Write queries a senior data analyst would actually run to deeply understand this specific dataset — not toy examples like "SELECT * FROM table LIMIT 10". Every query must reference real column names. Include ALL of the following patterns across the 10 queries: (1) summary statistics for key numeric columns (COUNT, AVG, MIN, MAX, STDDEV in one query), (2) GROUP BY with HAVING to find notable segments, (3) filtered WHERE clauses using domain-relevant conditions, (4) DISTINCT value counts for categorical columns, (5) ORDER BY with LIMIT for top-N / bottom-N analysis, (6) CASE WHEN for binning or conditional aggregation, (7) subqueries or CTEs for comparative analysis, (8) NULL analysis across important columns, (9) cross-column correlation queries (e.g. average of Y grouped by X), (10) date/time analysis if temporal columns exist, otherwise distribution analysis. Each query should be 40-250 characters.',
    '',
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
}): Promise<GenerationResult> {
  const messages: LlmMessage[] = [
    { role: 'system', content: 'You are a senior analytics assistant. Return valid JSON only.' },
    { role: 'user', content: params.prompt }
  ];

  const maxAttempts = MAX_SUGGESTION_RETRIES + 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const raw = await params.client.complete({
        messages,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
        reasoningEffort: 'low'
      });

      const parsed = SUGGESTION_SCHEMA.parse(extractJson(raw));
      const suggestions = normalizeSuggestions(parsed, params.limit);
      const workflowPlaceholders = parsed.workflowPlaceholders
        ? normalizeWorkflowPlaceholders(parsed.workflowPlaceholders)
        : undefined;
      return { suggestions, workflowPlaceholders };
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
    const datasets = await ensureProjectDatasetSqlNames(projectId, datasetRepository);
    return buildSchemaSummary(datasets, projectId);
  }

  async function getSuggestions({
    projectId,
    limit = DEFAULT_SUGGESTION_COUNT
  }: GetNlSuggestionsOptions): Promise<SuggestionResult> {
    const tables = await getProjectTables(projectId);

    if (tables.length === 0) {
      return { suggestions: [], cached: false, schemaFingerprint: '' };
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
      schemaFingerprint,
      workflowPlaceholders: stored?.workflowPlaceholders
    };
  }

  async function regenerateSuggestions({
    projectId,
    limit = DEFAULT_SUGGESTION_COUNT
  }: GetNlSuggestionsOptions): Promise<SuggestionResult> {
    const tables = await getProjectTables(projectId);

    if (tables.length === 0) {
      return { suggestions: [], cached: false, schemaFingerprint: '' };
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
        schemaFingerprint,
        workflowPlaceholders: existing.workflowPlaceholders
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
      const result = await running;
      return {
        suggestions: result.suggestions.slice(0, limit),
        cached: true,
        schemaFingerprint,
        workflowPlaceholders: result.workflowPlaceholders
      };
    }

    const generationPromise = (async () => {
      const client = getClient(modelId);
      const relationships = inferRelationshipHints(tables);
      const result = await requestSuggestions({
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
        suggestions: result.suggestions,
        workflowPlaceholders: result.workflowPlaceholders
      });

      return result;
    })().finally(() => {
      inflightSuggestionGenerations.delete(inflightKey);
    });

    inflightSuggestionGenerations.set(inflightKey, generationPromise);

    const result = await generationPromise;
    return {
      suggestions: result.suggestions.slice(0, limit),
      cached: false,
      schemaFingerprint,
      workflowPlaceholders: result.workflowPlaceholders
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

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { env } from '../../config.js';
import { createLlmClient, type LlmClient } from '../llm/llmClient.js';
import {
  getDefaultLlmModel,
  normalizeReasoningSelection,
  type LlmReasoningEffort
} from '../llm/modelCatalog.js';
import { validateReadOnlySql } from '../sqlValidator.js';

import { mergeExplanation } from './confidence.js';
import {
  normalizePass1Output,
  normalizePass2FallbackOutput,
  normalizePass2Output
} from './jsonNormalization.js';
import { createModelWorkBlock, emitNlProgress } from './progressEmitter.js';
import {
  buildCaseNormalizationValidationNote,
  buildPass1Prompt,
  buildPass2FallbackPrompt,
  buildPass2Prompt,
  buildSchemaContext,
  formatPlanningMarkdown,
  formatSchemaContextMarkdown,
  formatSqlGenerationMarkdown,
  formatValidationMarkdown,
  normalizeCaseSensitiveIdentifiers
} from './schemaContext.js';
import { requestStructuredJson, summarizeError } from './structuredRequest.js';
import type {
  GenerateSqlV2Options,
  GeneratedSqlV2,
  JoinCandidate,
  NlConfidenceMode,
  NlModelWorkEvent,
  NlProgressEvent,
  NlProviderInfo,
  SchemaTableContext
} from './types.js';
import {
  PASS1_SCHEMA as PASS1_SCHEMA_VAL,
  PASS2_FALLBACK_SCHEMA as PASS2_FALLBACK_SCHEMA_VAL,
  PASS2_SCHEMA as PASS2_SCHEMA_VAL
} from './types.js';

export function getNlProviderInfo(model: string): NlProviderInfo {
  return {
    id: 'openai',
    label: 'OpenAI',
    model
  };
}

export function getNl2SqlReasoningEffort(modelId: string): LlmReasoningEffort | undefined {
  return normalizeReasoningSelection({
    modelId,
    reasoningEffort: 'low'
  });
}

export function defaultGetClient(model: string): LlmClient {
  const timeoutMs = env.nl2sqlTimeoutMs > 0 ? env.nl2sqlTimeoutMs : env.llmTimeoutMs;
  return createLlmClient(model, timeoutMs);
}

/* ------------------------------------------------------------------ */
/*  Phase functions                                                    */
/* ------------------------------------------------------------------ */

async function phaseSchemaContext(
  deps: { datasetRepository: import('../../repositories/datasetRepository.js').DatasetRepository },
  projectId: string,
  defaultTable: string | undefined,
  onProgress: ((event: NlProgressEvent) => void) | undefined,
  onModelWork: ((event: NlModelWorkEvent) => void) | undefined,
  provider: NlProviderInfo
): Promise<{ tables: SchemaTableContext[]; defaultTableName: string | null; joinCandidates: JoinCandidate[] }> {
  emitNlProgress(onProgress, {
    phaseId: 'schema_context',
    status: 'started',
    summary: 'Building schema context from project datasets.'
  });

  try {
    const schemaContext = await buildSchemaContext(deps.datasetRepository, projectId, defaultTable);

    emitNlProgress(onProgress, {
      phaseId: 'schema_context',
      status: 'completed',
      summary: `Prepared schema context for ${schemaContext.tables.length} table${schemaContext.tables.length === 1 ? '' : 's'}.`
    });
    const schemaContextBlock = createModelWorkBlock({
      onModelWork,
      phaseId: 'schema_context',
      kind: 'status',
      title: 'Schema context',
      provider
    });
    schemaContextBlock.delta(formatSchemaContextMarkdown({
      tables: schemaContext.tables,
      defaultTableName: schemaContext.defaultTableName,
      joinCandidates: schemaContext.joinCandidates
    }));
    schemaContextBlock.complete();

    return schemaContext;
  } catch (error) {
    emitNlProgress(onProgress, {
      phaseId: 'schema_context',
      status: 'failed',
      summary: `Failed to build schema context: ${summarizeError(error)}`
    });
    throw error;
  }
}

async function phasePlanning(
  client: LlmClient,
  query: string,
  defaultTableName: string | null,
  tables: SchemaTableContext[],
  joinCandidates: JoinCandidate[],
  onProgress: ((event: NlProgressEvent) => void) | undefined,
  onModelWork: ((event: NlModelWorkEvent) => void) | undefined,
  provider: NlProviderInfo,
  defaultReasoningEffort: LlmReasoningEffort | undefined
): Promise<z.infer<typeof PASS1_SCHEMA_VAL>> {
  emitNlProgress(onProgress, {
    phaseId: 'planning',
    status: 'started',
    summary: 'Planning query intent, table selection, and join strategy.'
  });
  try {
    const planning = await requestStructuredJson({
      client,
      label: 'nl2sql_plan',
      schema: PASS1_SCHEMA_VAL,
      normalize: normalizePass1Output,
      maxOutputTokens: 900,
      reasoningEffort: defaultReasoningEffort,
      systemPrompt: 'You are a senior analytics SQL planner. Return valid JSON only.',
      userPrompt: buildPass1Prompt({ nlQuery: query, defaultTableName, tables, joinCandidates }),
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
    return planning;
  } catch (error) {
    emitNlProgress(onProgress, {
      phaseId: 'planning',
      status: 'failed',
      summary: `Model planning failed: ${summarizeError(error)}`
    });
    throw error;
  }
}

async function phaseSqlGeneration(
  client: LlmClient,
  query: string,
  defaultTableName: string | null,
  tables: SchemaTableContext[],
  planning: z.infer<typeof PASS1_SCHEMA_VAL>,
  model: string,
  onProgress: ((event: NlProgressEvent) => void) | undefined,
  onModelWork: ((event: NlModelWorkEvent) => void) | undefined,
  provider: NlProviderInfo,
  defaultReasoningEffort: LlmReasoningEffort | undefined
): Promise<z.infer<typeof PASS2_SCHEMA_VAL>> {
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
    const execution = await requestStructuredJson({
      client,
      label: 'nl2sql_result',
      schema: PASS2_SCHEMA_VAL,
      normalize: normalizePass2Output,
      maxOutputTokens: 1200,
      reasoningEffort: defaultReasoningEffort,
      systemPrompt: 'You are a senior SQL engineer. Return valid JSON only.',
      userPrompt: buildPass2Prompt({ nlQuery: query, defaultTableName, tables, planning }),
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
    return execution;
  } catch (error) {
    emitNlProgress(onProgress, {
      phaseId: 'sql_generation',
      status: 'failed',
      summary: `Primary SQL generation failed: ${summarizeError(error)}`
    });
    return phaseSqlGenerationFallback(
      client, query, defaultTableName, tables, planning, model,
      error, onProgress, onModelWork, provider
    );
  }
}

async function phaseSqlGenerationFallback(
  client: LlmClient,
  query: string,
  defaultTableName: string | null,
  tables: SchemaTableContext[],
  planning: z.infer<typeof PASS1_SCHEMA_VAL>,
  model: string,
  primaryError: unknown,
  onProgress: ((event: NlProgressEvent) => void) | undefined,
  onModelWork: ((event: NlModelWorkEvent) => void) | undefined,
  provider: NlProviderInfo
): Promise<z.infer<typeof PASS2_SCHEMA_VAL>> {
  try {
    emitNlProgress(onProgress, {
      phaseId: 'sql_generation',
      status: 'progress',
      summary: 'Retrying with compact SQL generation fallback.'
    });
    const compact = await requestStructuredJson({
      client,
      label: 'nl2sql_result_compact',
      schema: PASS2_FALLBACK_SCHEMA_VAL,
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
        recoveryReason: summarizeError(primaryError)
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

    const execution: z.infer<typeof PASS2_SCHEMA_VAL> = {
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
        `Recovered with compact fallback after rich SQL generation failed: ${summarizeError(primaryError)}`
      ])),
      validationNotes: [
        `compact fallback generated the final SQL after rich output validation failed: ${summarizeError(primaryError)}`
      ],
      confidence: compact.confidence
    };
    emitNlProgress(onProgress, {
      phaseId: 'sql_generation',
      status: 'completed',
      summary: 'Recovered with compact SQL generation.'
    });
    return execution;
  } catch (compactError) {
    emitNlProgress(onProgress, {
      phaseId: 'sql_generation',
      status: 'failed',
      summary: `Compact SQL generation failed: ${summarizeError(compactError)}`
    });
    throw compactError;
  }
}

function phaseValidation(
  execution: z.infer<typeof PASS2_SCHEMA_VAL>,
  planning: z.infer<typeof PASS1_SCHEMA_VAL>,
  tables: SchemaTableContext[],
  confidenceMode: NlConfidenceMode,
  onProgress: ((event: NlProgressEvent) => void) | undefined,
  onModelWork: ((event: NlModelWorkEvent) => void) | undefined,
  provider: NlProviderInfo
): GeneratedSqlV2 {
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

/* ------------------------------------------------------------------ */
/*  Orchestrator                                                       */
/* ------------------------------------------------------------------ */

export async function runGeneratePipeline(
  {
    projectId,
    nlQuery,
    defaultTable,
    onProgress,
    onModelWork
  }: GenerateSqlV2Options,
  deps: {
    datasetRepository: import('../../repositories/datasetRepository.js').DatasetRepository;
    getClient: (model: string) => LlmClient;
  }
): Promise<GeneratedSqlV2> {
  const model = env.nl2sqlModel || env.llmModel || getDefaultLlmModel();
  const provider = getNlProviderInfo(model);
  const defaultReasoningEffort = getNl2SqlReasoningEffort(model);
  const query = nlQuery.trim();
  if (!query) {
    throw new Error('Natural language query is required.');
  }

  const { tables, defaultTableName, joinCandidates } = await phaseSchemaContext(
    deps, projectId, defaultTable, onProgress, onModelWork, provider
  );

  if (tables.length === 0) {
    throw new Error('No dataset schema is available for this project. Upload data before using English mode.');
  }

  const client = deps.getClient(model);

  const planning = await phasePlanning(
    client, query, defaultTableName, tables, joinCandidates,
    onProgress, onModelWork, provider, defaultReasoningEffort
  );

  const confidenceMode: NlConfidenceMode = 'model';

  const execution = await phaseSqlGeneration(
    client, query, defaultTableName, tables, planning, model,
    onProgress, onModelWork, provider, defaultReasoningEffort
  );

  return phaseValidation(
    execution, planning, tables, confidenceMode,
    onProgress, onModelWork, provider
  );
}


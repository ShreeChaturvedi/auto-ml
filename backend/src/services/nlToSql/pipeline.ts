import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { env } from '../../config.js';
import { createLlmClient, type LlmClient, type LlmMessage } from '../llm/llmClient.js';
import {
  getDefaultLlmModel,
  normalizeReasoningSelection,
  type LlmReasoningEffort
} from '../llm/modelCatalog.js';
import { validateReadOnlySql } from '../sqlValidator.js';

import { extractJson, normalizePass1Output, normalizePass2FallbackOutput, normalizePass2Output } from './jsonNormalization.js';
import {
  buildCaseNormalizationValidationNote,
  buildPass1Prompt,
  buildPass2FallbackPrompt,
  buildPass2Prompt,
  buildSchemaContext,
  clampConfidence,
  formatPlanningMarkdown,
  formatSchemaContextMarkdown,
  formatSqlGenerationMarkdown,
  formatValidationMarkdown,
  normalizeCaseSensitiveIdentifiers
} from './schemaContext.js';
import type {
  GenerateSqlV2Options,
  GeneratedSqlV2,
  JoinCandidate,
  NlConfidenceMode,
  NlExplanation,
  NlModelWorkBlockCompletedEvent,
  NlModelWorkBlockStartedEvent,
  NlModelWorkDeltaEvent,
  NlModelWorkEvent,
  NlModelWorkKind,
  NlProgressEvent,
  NlProgressPhaseId,
  NlProviderInfo,
  SchemaTableContext,
  WarningLevel
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

export function isTimeoutLikeError(error: unknown): boolean {
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

export function summarizeError(error: unknown): string {
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

export function toStructuredRequestError(label: string, error: unknown): Error {
  if (isTimeoutLikeError(error)) {
    return new Error(`${label} request timed out after ${env.nl2sqlTimeoutMs}ms.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function emitNlProgress(
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

export function emitNlModelWork(
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

export function createModelWorkBlock(params: {
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

export async function requestStructuredJson<T extends z.ZodTypeAny>(params: {
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

export function deriveWarningLevel(
  confidence: number,
  assumptions: string[],
  joinPlan: NlExplanation['joinPlan'],
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

export function deriveReliabilityTier(
  confidenceMode: NlConfidenceMode,
  warningLevel: WarningLevel
): NlExplanation['reliabilityTier'] {
  if (confidenceMode === 'repair') {
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

export function resolveWarnConfidenceThreshold(): number {
  return Number.isFinite(env.nl2sqlWarnConfidenceThreshold)
    ? env.nl2sqlWarnConfidenceThreshold
    : 0.72;
}

export function mergeExplanation(
  planning: z.infer<typeof PASS1_SCHEMA_VAL>,
  execution: z.infer<typeof PASS2_SCHEMA_VAL>,
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

export function defaultGetClient(model: string): LlmClient {
  const timeoutMs = env.nl2sqlTimeoutMs > 0 ? env.nl2sqlTimeoutMs : env.llmTimeoutMs;
  return createLlmClient(model, timeoutMs);
}

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
      deps.datasetRepository,
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

  const client = deps.getClient(model);

  let planning: z.infer<typeof PASS1_SCHEMA_VAL>;
  emitNlProgress(onProgress, {
    phaseId: 'planning',
    status: 'started',
    summary: 'Planning query intent, table selection, and join strategy.'
  });
  try {
    planning = await requestStructuredJson({
      client,
      label: 'nl2sql_plan',
      schema: PASS1_SCHEMA_VAL,
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
    throw error;
  }

  let execution: z.infer<typeof PASS2_SCHEMA_VAL>;
  const confidenceMode: NlConfidenceMode = 'model';
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
      schema: PASS2_SCHEMA_VAL,
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
      emitNlProgress(onProgress, {
        phaseId: 'sql_generation',
        status: 'failed',
        summary: `Compact SQL generation failed: ${summarizeError(compactError)}`
      });
      throw compactError;
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

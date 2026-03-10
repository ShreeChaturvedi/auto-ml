import { randomUUID } from 'node:crypto';

import { env } from '../../config.js';
import { getDefaultLlmModel } from '../llm/modelCatalog.js';
import { validateReadOnlySql } from '../sqlValidator.js';

import { normalizeRepairOutput } from './jsonNormalization.js';
import {
  createModelWorkBlock,
  deriveReliabilityTier,
  deriveWarningLevel,
  emitNlProgress,
  getNl2SqlReasoningEffort,
  getNlProviderInfo,
  requestStructuredJson,
  resolveWarnConfidenceThreshold,
  summarizeError
} from './pipeline.js';
import {
  buildCaseNormalizationValidationNote,
  buildRepairPrompt,
  buildSchemaContext,
  clampConfidence,
  formatRepairMarkdown,
  formatSchemaContextMarkdown,
  normalizeCaseSensitiveIdentifiers
} from './schemaContext.js';
import type {
  GeneratedSqlV2,
  NlConfidenceMode,
  RepairSqlV2Options
} from './types.js';
import { REPAIR_SCHEMA } from './types.js';

export async function runRepairPipeline(
  {
    projectId,
    nlQuery,
    failedSql,
    executionError,
    defaultTable,
    priorExplanation,
    onProgress,
    onModelWork
  }: RepairSqlV2Options,
  deps: {
    datasetRepository: import('../../repositories/datasetRepository.js').DatasetRepository;
    getClient: (model: string) => import('../llm/llmClient.js').LlmClient;
  }
): Promise<GeneratedSqlV2> {
  const model = env.nl2sqlModel || env.llmModel || getDefaultLlmModel();
  const provider = getNlProviderInfo(model);
  const defaultReasoningEffort = getNl2SqlReasoningEffort(model);
  emitNlProgress(onProgress, {
    phaseId: 'repair',
    status: 'started',
    summary: 'Repairing generated SQL using database execution feedback.'
  });

  try {
    const { tables, defaultTableName } = await buildSchemaContext(
      deps.datasetRepository,
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

    const client = deps.getClient(model);

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
        formatResult: (result) => formatRepairMarkdown({
          sql: result.sql,
          rationale: result.rationale,
          assumptions: result.assumptions,
          validationNotes: result.validationNotes,
          confidence: result.confidence ?? 0.6
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

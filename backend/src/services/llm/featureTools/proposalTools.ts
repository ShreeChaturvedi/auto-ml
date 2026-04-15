import { env } from '../../../config.js';
import { appLogger } from '../../../logging/logger.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import { isActionableFeatureCode } from '../../featureEngineering/codeGenerator.js';
import { hashCode, nowIso } from '../preprocessingTools/helpers.js';

import type { FeatureToolContext, FeatureToolHandler } from './types.js';

// Singleton repository for dataset schema lookups during proposal validation.
// Mirrors the pattern used elsewhere (dataHandlers.ts, toolExecutor.ts).
const proposalDatasetRepository = createDatasetRepository(env.datasetMetadataPath);

function requireFeatureRun(
  ctx: FeatureToolContext,
  toolName: 'propose_feature' | 'materialize_feature_code'
) {
  if (!ctx.run || !ctx.runRepository) {
    return {
      error: `${toolName} could not persist because the feature run is unavailable. Start a new feature engineering run and try again.`
    };
  }

  return {
    run: ctx.run,
    runRepository: ctx.runRepository
  };
}

/**
 * Validate that every sourceColumn exists in the active dataset's schema.
 *
 * Soft-fails open when:
 *   - ctx.datasetId is absent (phase running without dataset binding)
 *   - dataset lookup throws (transient repository error)
 *   - dataset.columns is missing
 *
 * Returns an error object when columns are mismatched; undefined when valid.
 */
async function validateSourceColumnsAgainstDataset(
  ctx: FeatureToolContext,
  sourceColumns: string[]
): Promise<{ error: string } | undefined> {
  if (!ctx.datasetId) {
    appLogger.debug('[proposeFeature] No datasetId in context; skipping column validation');
    return undefined;
  }
  if (!Array.isArray(sourceColumns) || sourceColumns.length === 0) {
    return undefined;
  }
  let dataset;
  try {
    dataset = await proposalDatasetRepository.getById(ctx.datasetId);
  } catch (err) {
    appLogger.warn('[proposeFeature] Dataset lookup failed, skipping column validation', {
      datasetId: ctx.datasetId,
      error: err instanceof Error ? err.message : String(err)
    });
    return undefined;
  }
  if (!dataset || !Array.isArray(dataset.columns)) {
    return undefined;
  }

  const availableColumns = new Set(dataset.columns.map((col) => col.name));
  const missing = sourceColumns.filter((col) => !availableColumns.has(col));
  if (missing.length > 0) {
    const missingList = missing.map((c) => `"${c}"`).join(', ');
    return {
      error:
        `Proposed sourceColumns ${missingList} do not exist in the active dataset "${dataset.filename}". ` +
        `Available columns: ${[...availableColumns].slice(0, 20).map((c) => `"${c}"`).join(', ')}` +
        `${availableColumns.size > 20 ? ` (and ${availableColumns.size - 20} more)` : ''}. ` +
        'Use only columns from the active dataset — do not reference columns from other datasets.'
    };
  }
  return undefined;
}

/**
 * propose_feature — declare a feature intent with rationale, method, and parameters.
 * Persists the proposal as a FeatureStepRecord when a run is available.
 */
/**
 * Detect when the turn prompt contains the "Selected feature IDs to implement"
 * marker. When present, `propose_feature` must be rejected at the handler level
 * because we're in IMPLEMENTATION mode, not proposal mode — the user already
 * reviewed and selected features, and the LLM must materialize them.
 *
 * The backend filters `propose_feature` from the tool list in continuation
 * mode (phaseRequestBuilder.ts), but OpenAI's Responses API still allows the
 * LLM to hallucinate tool calls for unlisted tools — especially when the
 * tool call history shows a strong prior pattern of proposing. Without this
 * handler-level guard, the LLM gets stuck in a "propose more" loop instead
 * of materializing the features the user selected.
 */
function promptHasSelectedFeatureIds(prompt: string | undefined): boolean {
  if (!prompt) return false;
  const match = prompt.match(/^Selected feature IDs to implement:\s*(.+)$/im);
  if (!match) return false;
  const ids = match[1]
    .split(/\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return ids.length > 0;
}

export const proposeFeature: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const rationale = typeof args.rationale === 'string' && args.rationale.trim().length > 0
    ? args.rationale
    : ctx.rationale;

  // Hard-reject propose_feature in implementation mode. When the user clicks
  // "Generate Notebook Steps" the prompt contains "Selected feature IDs to
  // implement: ...". Any propose_feature call at this point is an LLM
  // hallucination — it should be calling materialize_feature_code for one of
  // the already-selected feature IDs. Return an error so the retry logic can
  // steer the LLM back to the correct lifecycle step.
  const implementationMode = promptHasSelectedFeatureIds(ctx.prompt);
  if (implementationMode) {
    appLogger.warn(
      '[proposeFeature] guard fired — rejecting propose_feature in implementation mode (featureId=%s, promptLen=%d)',
      args.featureId ?? '<unset>',
      ctx.prompt?.length ?? 0
    );
    return {
      error: 'propose_feature is not allowed in implementation mode. The user has already selected features to implement (see "Selected feature IDs to implement" in the user message). Call materialize_feature_code for the next selected feature id instead. Do NOT propose additional features.'
    };
  }
  // Diagnostic trace: log every propose_feature dispatch so we can confirm
  // whether ctx.prompt is reaching the handler and whether the marker is
  // present. Previously, runs were losing ctx.prompt via executeFeatureToolCall
  // and the guard silently skipped.
  appLogger.debug(
    '[proposeFeature] guard pass-through (featureId=%s, hasPrompt=%s, promptLen=%d)',
    args.featureId ?? '<unset>',
    Boolean(ctx.prompt),
    ctx.prompt?.length ?? 0
  );

  const featureId = (args.featureId as string) ?? `feat-${Date.now()}`;
  const timestamp = nowIso();

  // Validate that proposed source columns exist in the active dataset.
  // Prevents the LLM from hallucinating columns from sibling datasets
  // (e.g., proposing RPD documentation features when a tableau dataset
  // is the active draft's binding).
  const sourceColumns = Array.isArray(args.sourceColumns)
    ? (args.sourceColumns as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  const schemaError = await validateSourceColumnsAgainstDataset(ctx, sourceColumns);
  if (schemaError) {
    return { error: `propose_feature: ${schemaError.error}` };
  }

  const output = {
    status: 'proposed',
    message: 'Feature proposed — awaiting user review',
    featureId,
    featureName: args.featureName,
    method: args.method,
    rationale,
    impact: args.impact ?? 'medium',
    sourceColumns: args.sourceColumns ?? [],
    runId: ctx.run?.runId
  };

  const persistence = requireFeatureRun(ctx, 'propose_feature');
  if ('error' in persistence) {
    return { error: persistence.error };
  }

  persistence.run.features[featureId] = {
    featureId,
    name: (args.featureName as string) ?? featureId,
    method: (args.method as string) ?? 'unknown',
    rationale,
    sourceColumns,
    impact: (args.impact as string) ?? 'medium',
    status: 'proposed',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  await persistence.runRepository.save(persistence.run);

  return { output };
};

/**
 * materialize_feature_code — attach executable Python code to a proposed feature.
 * Persists the code and updates the feature status when a run is available.
 */
export const materializeFeatureCode: FeatureToolHandler = async (ctx: FeatureToolContext) => {
  const { args } = ctx;
  const featureId = args.featureId as string;
  const code = args.code as string;

  if (!featureId || !code) {
    return { error: 'materialize_feature_code requires featureId and code' };
  }

  // Content guard — reject placeholder comments and any code that doesn't
  // reference the `df` dataframe. This stops the LLM's hallucinated pattern
  // of writing "# Placeholder: materialization deferred..." as the code
  // argument, which would otherwise pass through execute/validate/register
  // silently and produce an empty output file in apply.
  if (!isActionableFeatureCode(code)) {
    return {
      error:
        'materialize_feature_code rejected: code is not actionable. It must be ' +
        'final executable Python that references the `df` dataframe and creates ' +
        "the declared outputColumns. Placeholder comments (e.g., '# Placeholder') " +
        'and code that does not touch `df` are not allowed. Rewrite with the real ' +
        'transformation.'
    };
  }

  // outputColumns is now required and must contain at least one non-placeholder name.
  const outputColumns = Array.isArray(args.outputColumns)
    ? (args.outputColumns as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  if (outputColumns.length === 0) {
    return {
      error:
        'materialize_feature_code requires non-empty outputColumns. Pass the exact ' +
        'column names your code creates in the df (e.g., ["department_usage_share"]).'
    };
  }
  const hasPlaceholderOutputName = outputColumns.some((name) =>
    name.trim().toLowerCase() === 'placeholder' || name.trim().length === 0
  );
  if (hasPlaceholderOutputName) {
    return {
      error:
        'materialize_feature_code: outputColumns contains a placeholder name. Use ' +
        'the actual column names your code creates in df, not "placeholder" or empty strings.'
    };
  }

  const output = {
    status: 'ok',
    message: 'Feature code materialized',
    featureId,
    outputColumns,
    codeLength: code.length,
    runId: ctx.run?.runId
  };

  const persistence = requireFeatureRun(ctx, 'materialize_feature_code');
  if ('error' in persistence) {
    return { error: persistence.error };
  }

  // If the featureId already has a proposal in the run state, update it.
  // Otherwise create a new entry on the fly — the previous code silently
  // dropped the materialization when the id wasn't in run.features, then
  // returned {output: {status: 'ok'}}, which misled the LLM into calling
  // execute_feature on a feature that had no persisted code. The execute
  // handler then looped with "No code found for feature X — call
  // materialize_feature_code first", burning iterations until the workflow
  // hit MAX_ITERATIONS_EXCEEDED.
  const now = nowIso();
  const existing = persistence.run.features[featureId];
  if (existing) {
    existing.code = code;
    existing.codeHash = hashCode(code);
    existing.outputColumns = outputColumns;
    existing.status = 'code_ready';
    existing.updatedAt = now;
  } else {
    persistence.run.features[featureId] = {
      featureId,
      name: (args.featureName as string) ?? featureId,
      method: (args.method as string) ?? 'custom',
      sourceColumns: Array.isArray(args.sourceColumns)
        ? (args.sourceColumns as unknown[]).filter((c): c is string => typeof c === 'string')
        : [],
      status: 'code_ready',
      code,
      codeHash: hashCode(code),
      outputColumns,
      createdAt: now,
      updatedAt: now
    };
  }
  await persistence.runRepository.save(persistence.run);

  return { output };
};

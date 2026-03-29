import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

import { env } from '../../../config.js';
import { hasDatabaseConfiguration } from '../../../db.js';
import { appLogger } from '../../../logging/logger.js';
import { createDatasetRepository } from '../../../repositories/datasetRepository.js';
import { getNotebook } from '../../../repositories/notebook/index.js';
import type { ValidationMetrics } from '../../../repositories/preprocessingRunRepository.js';
import { asBoolean, asNumber, asString } from '../../../utils/typeCoercion.js';
import { loadDatasetIntoPostgres, parseDatasetRows } from '../../datasetLoader.js';
import { profileDatasetRows } from '../../datasetProfiler.js';

import {
  appendEvent,
  ensureStepExists,
  fail,
  nowIso,
  ok,
  resolveProjectDataset,
  serializeStep,
  toCellBindings,
  toSchemaSnapshot
} from './helpers.js';
import type { ToolContext, ToolHandler } from './types.js';

export const validateStepResult: ToolHandler = async (ctx: ToolContext) => {
  const { run, args, toolCallId, runRepository } = ctx;
  const stepId = asString(args.stepId);
  const maybeStep = ensureStepExists(run, run.runId, stepId);
  if ('error' in maybeStep) {
    return maybeStep;
  }
  const step = maybeStep;

  if (!step.lastExecuteSucceeded) {
    return fail(
      run.runId,
      'STEP_VALIDATE_REQUIRES_SUCCESSFUL_EXECUTE',
      `Step ${step.stepId} must execute successfully before validation.`,
      { stepId: step.stepId }
    );
  }

  if (step.cellIds.length === 0) {
    return fail(
      run.runId,
      'STEP_APPLIED_REQUIRES_CELL_BINDINGS',
      `Step ${step.stepId} must bind at least one cell before it can be applied.`,
      { stepId: step.stepId }
    );
  }

  const requiresApproval = asBoolean(args.requiresApproval) ?? step.requiresApproval;
  const validation: ValidationMetrics = {
    rowCountBefore: asNumber(args.rowCountBefore),
    rowCountAfter: asNumber(args.rowCountAfter),
    nullCountBefore: asNumber(args.nullCountBefore),
    nullCountAfter: asNumber(args.nullCountAfter),
    schemaDrift: asBoolean(args.schemaDrift),
    notes: asString(args.notes)
  };

  step.requiresApproval = requiresApproval;
  step.validation = validation;
  step.approvalDecision = requiresApproval ? 'pending' : 'approved';
  step.decisionReason = undefined;
  step.toolCallId = toolCallId ?? step.toolCallId;
  step.lastValidateSucceeded = true;
  step.status = requiresApproval ? 'awaiting_approval' : 'applied';
  step.updatedAt = nowIso();
  const cellBindings = toCellBindings(run.runId, step, step.updatedAt, toolCallId);

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'step_validated',
    stepId: step.stepId,
    payload: {
      toolCallId: step.toolCallId,
      cellBindings,
      requiresApproval,
      validation
    }
  });
  await runRepository.save(run);

  return ok(run.runId, {
    stepId: step.stepId,
    status: step.status,
    cellBindings,
    step: serializeStep(step)
  });
};

export const commitTransformationStep: ToolHandler = async (ctx: ToolContext) => {
  const { projectId, run, args, toolCallId, datasetRepository, runRepository } = ctx;
  const stepId = asString(args.stepId);
  const maybeStep = ensureStepExists(run, run.runId, stepId);
  if ('error' in maybeStep) {
    return maybeStep;
  }
  const step = maybeStep;

  if (!step.lastExecuteSucceeded || !step.lastValidateSucceeded) {
    return fail(
      run.runId,
      'STEP_COMMIT_REQUIRES_EXECUTE_VALIDATE',
      `Step ${step.stepId} cannot commit before successful execute and validate.`,
      { stepId: step.stepId }
    );
  }

  if (step.cellIds.length === 0) {
    return fail(
      run.runId,
      'STEP_APPLIED_REQUIRES_CELL_BINDINGS',
      `Step ${step.stepId} must bind at least one cell before commit.`,
      { stepId: step.stepId }
    );
  }

  const approved = asBoolean(args.approved);
  const approvalSource = asString(args.approvalSource);
  if (step.status === 'awaiting_approval' && typeof approved === 'undefined') {
    return fail(
      run.runId,
      'STEP_APPROVAL_REQUIRED',
      `Step ${step.stepId} requires explicit approval=true before commit.`,
      { stepId: step.stepId }
    );
  }
  if (step.status === 'awaiting_approval' && approvalSource !== 'user') {
    return fail(
      run.runId,
      'STEP_APPROVAL_USER_REQUIRED',
      `Step ${step.stepId} can only be approved or rejected through an explicit user decision.`,
      { stepId: step.stepId }
    );
  }

  if (approved === false) {
    const decisionReason = asString(args.rejectionReason) ?? 'Rejected by user';
    step.status = 'failed';
    step.approvalDecision = 'rejected';
    step.decisionReason = decisionReason;
    step.toolCallId = toolCallId ?? step.toolCallId;
    step.updatedAt = nowIso();
    const cellBindings = toCellBindings(run.runId, step, step.updatedAt, toolCallId);
    appendEvent(run, {
      eventId: randomUUID(),
      runId: run.runId,
      type: 'step_committed',
      stepId: step.stepId,
      payload: {
        toolCallId: step.toolCallId,
        cellBindings,
        approved,
        decisionReason,
        status: step.status
      }
    });
    await runRepository.save(run);
    return ok(run.runId, {
      stepId: step.stepId,
      status: step.status,
      cellBindings,
      step: serializeStep(step)
    });
  }

  const datasetRef = asString(args.datasetId) ?? run.activeDatasetId;
  if (!datasetRef) {
    return fail(
      run.runId,
      'MISSING_REQUIRED_ARG',
      'commit_transformation_step requires datasetId or active dataset context.',
      { stepId: step.stepId }
    );
  }

  const dataset = await resolveProjectDataset(datasetRepository, projectId, datasetRef);
  if (!dataset) {
    return fail(run.runId, 'DATASET_NOT_FOUND', 'Dataset not found in project context.', {
      stepId: step.stepId,
      datasetId: datasetRef
    });
  }

  step.status = 'applied';
  step.approvalDecision = 'approved';
  step.decisionReason = undefined;
  step.toolCallId = toolCallId ?? step.toolCallId;
  step.updatedAt = nowIso();
  run.activeDatasetId = dataset.datasetId;
  const cellBindings = toCellBindings(run.runId, step, step.updatedAt, toolCallId);

  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'step_committed',
    stepId: step.stepId,
    datasetId: dataset.datasetId,
    payload: {
      toolCallId: step.toolCallId,
      approved: approved ?? true,
      requiredInputSchema: toSchemaSnapshot(dataset),
      cellBindings,
      cellIds: step.cellIds,
      status: step.status
    }
  });

  const checkpointId = `ckpt-${randomUUID()}`;
  const checkpoint = {
    checkpointId,
    label: asString(args.label) ?? `Committed ${step.title}`,
    datasetId: dataset.datasetId,
    stepIds: [step.stepId],
    createdAt: nowIso(),
    replayUntilEventSequence: run.events.length
  };
  run.checkpoints.push(checkpoint);
  appendEvent(run, {
    eventId: randomUUID(),
    runId: run.runId,
    type: 'checkpoint_created',
    checkpointId,
    datasetId: checkpoint.datasetId,
    payload: {
      label: checkpoint.label,
      stepIds: checkpoint.stepIds,
      replayUntilEventSequence: checkpoint.replayUntilEventSequence
    }
  });

  // ── Persist the processed dataset so it appears in Explorer ──────────────
  let derivedDatasetId: string | undefined;
  try {
    derivedDatasetId = await persistProcessedDataset(run, dataset, datasetRepository, asString(args.notebookId));
  } catch (persistError) {
    appLogger.error('[commitTransformationStep] Failed to persist processed dataset (non-fatal)', persistError);
  }

  await runRepository.save(run);
  return ok(run.runId, {
    stepId: step.stepId,
    checkpointId,
    status: step.status,
    checkpoint,
    cellBindings,
    step: serializeStep(step),
    ...(derivedDatasetId ? { derivedDatasetId } : {})
  });
};

// ── Persist processed dataset helper ──────────────────────────────────────────

const persistDatasetRepo = createDatasetRepository(env.datasetMetadataPath);

/**
 * Resolve the workspace file path for a dataset that was modified during
 * preprocessing. The file may live at one of several locations depending on
 * how the workspace was set up.
 *
 * Container workspaces live under `{base}/{projectId}/{containerId}/datasets/`.
 * We scan UUID-named subdirectories and pick the most recently modified copy
 * so we get the actual processed data rather than the original.
 */
function resolveWorkspaceFilePath(projectId: string, filename: string, datasetId: string): string | undefined {
  const base = env.executionWorkspaceDir;
  const projectDir = join(base, projectId);

  // Candidates inside container subdirectories (most recently modified first)
  const containerCandidates = findContainerWorkspaceFiles(projectDir, filename, datasetId);

  // Static candidates (project-level workspace locations)
  const staticCandidates = [
    join(projectDir, filename),
    join(projectDir, 'datasets', filename),
    join(projectDir, 'datasets', datasetId, filename)
  ].filter((c) => existsSync(c));

  // Prefer container workspace files — they contain the actual processed data
  const allCandidates = [...containerCandidates, ...staticCandidates];
  if (allCandidates.length === 0) return undefined;

  // Return the most recently modified file
  return allCandidates.reduce((best, candidate) => {
    const bestMtime = statSync(best).mtimeMs;
    const candidateMtime = statSync(candidate).mtimeMs;
    return candidateMtime > bestMtime ? candidate : best;
  });
}

/**
 * Scan UUID-named subdirectories under the project workspace for copies of
 * the dataset file. Returns paths sorted by modification time (newest first).
 */
function findContainerWorkspaceFiles(projectDir: string, filename: string, datasetId: string): string[] {
  if (!existsSync(projectDir)) return [];

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const results: Array<{ path: string; mtimeMs: number }> = [];

  try {
    const entries = readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !UUID_RE.test(entry.name)) continue;

      const candidates = [
        join(projectDir, entry.name, filename),
        join(projectDir, entry.name, 'datasets', filename),
        join(projectDir, entry.name, 'datasets', datasetId, filename)
      ];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          results.push({ path: candidate, mtimeMs: statSync(candidate).mtimeMs });
        }
      }
    }
  } catch {
    // Ignore directory read errors
  }

  // Sort newest first
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results.map((r) => r.path);
}

/**
 * Sanitize a name for use in a filename: lowercase, replace spaces/special
 * chars with underscores, collapse runs, and trim.
 */
function sanitizeForFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Derive a human-friendly "_processed" filename from the original.
 * When a workbook name is available, it's included so users can tell which
 * workbook created the file (e.g. "iris_test_processed_workbook_1.csv").
 * Falls back to just "_processed" when no workbook name is available.
 */
function deriveProcessedFilename(originalFilename: string, workbookName?: string): string {
  const ext = extname(originalFilename);
  let base = basename(originalFilename, ext);
  // Strip any existing _processed* suffix so we don't get
  // "file_processed_wb1_processed_wb1.csv" on the second commit.
  base = base.replace(/_processed(?:_[a-z0-9_]*)?$/, '');
  const suffix = workbookName ? `_${sanitizeForFilename(workbookName)}` : '';
  return `${base}_processed${suffix}${ext}`;
}

/**
 * Resolve the workbook name from a notebook ID. The notebook metadata stores
 * the workbook tab name set by the frontend when the user renames a workbook.
 * Falls back to the notebook's own name when tab metadata isn't present.
 */
async function resolveWorkbookName(notebookId: string | undefined): Promise<string | undefined> {
  if (!notebookId || !hasDatabaseConfiguration()) return undefined;
  try {
    const notebook = await getNotebook(notebookId);
    if (!notebook) return undefined;
    const meta = notebook.metadata as Record<string, unknown> | undefined;
    const tabName = typeof meta?.tabName === 'string' ? meta.tabName : undefined;
    return tabName ?? notebook.name ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * After a preprocessing step is committed, persist the modified workspace
 * file as a derived dataset so it shows up in the Explorer.
 *
 * This is intentionally wrapped in try/catch by the caller so persistence
 * failures never break the commit flow.
 *
 * Returns the derived dataset ID so it can be included in the tool result.
 */
async function persistProcessedDataset(
  run: import('../../../repositories/preprocessingRunRepository.js').PreprocessingRunState,
  sourceDataset: { datasetId: string; filename: string; fileType?: string; projectId?: string },
  ctxDatasetRepository: import('../../../repositories/datasetRepository.js').DatasetRepository,
  notebookId?: string
): Promise<string | undefined> {
  const projectId = run.projectId;

  // 1. Find the workspace file
  const workspacePath = resolveWorkspaceFilePath(projectId, sourceDataset.filename, sourceDataset.datasetId);
  if (!workspacePath) {
    appLogger.warn('[persistProcessedDataset] Could not find workspace file for dataset', {
      projectId,
      filename: sourceDataset.filename,
      datasetId: sourceDataset.datasetId
    });
    return undefined;
  }

  // 2. Read and parse the file
  const buffer = readFileSync(workspacePath);
  const fileType = (extname(sourceDataset.filename).replace('.', '').toLowerCase() || 'csv') as 'csv' | 'json' | 'xlsx';
  const rows = await parseDatasetRows(buffer, fileType, sourceDataset.filename);
  if (rows.length === 0) {
    appLogger.warn('[persistProcessedDataset] Parsed 0 rows from workspace file, skipping');
    return undefined;
  }

  // 3. Profile the data
  const profile = profileDatasetRows(rows);
  const workbookName = await resolveWorkbookName(notebookId);
  const processedFilename = deriveProcessedFilename(sourceDataset.filename, workbookName);
  const fileSize = statSync(workspacePath).size;

  // 4. Check if a derived dataset already exists for this run+source combination.
  //    We use the file-backed repo (persistDatasetRepo) for the lookup because
  //    the Postgres datasets table lacks a metadata column — derivedFrom is only
  //    reliably stored in the file-backed metadata.json.
  //    If the "source" is itself a derived dataset, trace back to the ORIGINAL
  //    so multiple commits in the same run always upsert the same derived entry.
  const allDatasets = await persistDatasetRepo.listByProject(projectId);
  const sourceMeta = allDatasets.find((d) => d.datasetId === sourceDataset.datasetId);
  const originalSourceId = typeof sourceMeta?.metadata?.derivedFrom === 'string'
    ? sourceMeta.metadata.derivedFrom
    : sourceDataset.datasetId;
  const existingDerived = allDatasets.find((d) =>
    d.metadata?.derivedFrom === originalSourceId &&
    (d.metadata?.preprocessing as Record<string, unknown> | undefined)?.runId === run.runId
  );

  let derivedDatasetId: string;

  if (existingDerived) {
    // UPDATE existing derived dataset
    derivedDatasetId = existingDerived.datasetId;

    // Overwrite the file in storage
    const storageDir = join(env.datasetStorageDir, derivedDatasetId);
    mkdirSync(storageDir, { recursive: true });
    copyFileSync(workspacePath, join(storageDir, processedFilename));

    await persistDatasetRepo.update(derivedDatasetId, (current) => ({
      ...current,
      filename: processedFilename,
      size: fileSize,
      nRows: profile.nRows,
      nCols: profile.columns.length,
      columns: profile.columns,
      sample: profile.sample,
      metadata: {
        ...(current.metadata ?? {}),
        derivedFrom: originalSourceId,
        preprocessing: { runId: run.runId }
      }
    }));
  } else {
    // CREATE a new derived dataset
    const created = await persistDatasetRepo.create({
      projectId,
      filename: processedFilename,
      fileType,
      size: fileSize,
      profile: {
        nRows: profile.nRows,
        columns: profile.columns,
        sample: profile.sample
      },
      metadata: {
        derivedFrom: originalSourceId,
        preprocessing: { runId: run.runId }
      }
    });
    derivedDatasetId = created.datasetId;

    // Copy workspace file to storage
    const storageDir = join(env.datasetStorageDir, derivedDatasetId);
    mkdirSync(storageDir, { recursive: true });
    copyFileSync(workspacePath, join(storageDir, processedFilename));

    // Track the derived dataset in the run
    run.derivedDatasetIds.push(derivedDatasetId);
  }

  // 5. Load into Postgres if configured
  if (hasDatabaseConfiguration()) {
    try {
      const { tableName, rowsLoaded } = await loadDatasetIntoPostgres({
        datasetId: derivedDatasetId,
        filename: processedFilename,
        fileType,
        buffer,
        columns: profile.columns,
        rows
      });

      // Update metadata with table name and row count — always use the
      // file-backed repo so derivedFrom and other metadata is preserved.
      await persistDatasetRepo.update(derivedDatasetId, (current) => ({
        ...current,
        nRows: rowsLoaded,
        metadata: {
          ...(current.metadata ?? {}),
          tableName,
          rowsLoaded
        }
      }));

      appLogger.info('[persistProcessedDataset] Loaded processed dataset into Postgres', {
        derivedDatasetId,
        tableName,
        rowsLoaded
      });
    } catch (pgError) {
      appLogger.error('[persistProcessedDataset] Failed to load into Postgres (non-fatal)', pgError);
    }
  }

  appLogger.info('[persistProcessedDataset] Persisted processed dataset', {
    derivedDatasetId,
    processedFilename,
    sourceDatasetId: sourceDataset.datasetId,
    nRows: profile.nRows
  });

  return derivedDatasetId;
}

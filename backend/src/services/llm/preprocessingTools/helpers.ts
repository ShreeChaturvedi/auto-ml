import { createHash, randomUUID } from 'node:crypto';

import type { DatasetRepository } from '../../../repositories/datasetRepository.js';
import type {
  DatasetSchemaSnapshot,
  PreprocessingCellBinding,
  PreprocessingRunEvent,
  PreprocessingRunState,
  StepState
} from '../../../repositories/preprocessingRunRepository.js';
import { asRecord, asString } from '../../../utils/typeCoercion.js';

import type { PreprocessingCellInspector, ReasonCode, ToolEnvelope } from './types.js';

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashCode(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 24);
}

export function toCellBinding(runId: string, step: StepState, updatedAt: string, toolCallId?: string): PreprocessingCellBinding {
  return {
    runId,
    stepId: step.stepId,
    toolCallId: toolCallId ?? step.toolCallId,
    version: step.version,
    codeHash: step.codeHash,
    updatedAt
  };
}

export function toCellBindings(
  runId: string,
  step: StepState,
  updatedAt: string,
  toolCallId?: string
): Array<PreprocessingCellBinding & { cellId: string }> {
  const binding = toCellBinding(runId, step, updatedAt, toolCallId);
  return step.cellIds.map((cellId) => ({
    cellId,
    ...binding
  }));
}

export function ok(runId: string, data: Omit<ToolEnvelope, 'runId' | 'isError' | 'reasonCode'>): {
  output: ToolEnvelope;
  error?: string;
} {
  return {
    output: {
      runId,
      isError: false,
      reasonCode: null,
      ...data
    }
  };
}

export function fail(
  runId: string,
  reasonCode: ReasonCode,
  message: string,
  data: Omit<ToolEnvelope, 'runId' | 'isError' | 'reasonCode'> = {}
): {
  output: ToolEnvelope;
  error: string;
} {
  return {
    output: {
      runId,
      isError: true,
      reasonCode,
      ...data
    },
    error: message
  };
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

export function mergeUniqueStrings(...groups: string[][]): string[] {
  const merged = new Set<string>();
  for (const group of groups) {
    for (const value of group) {
      if (value.trim()) {
        merged.add(value.trim());
      }
    }
  }
  return [...merged];
}

export function inferRiskyIntent(intentType: string): boolean {
  const lowered = intentType.toLowerCase();
  return lowered.includes('drop') || lowered.includes('outlier') || lowered.includes('custom');
}

export function serializeStep(step: StepState) {
  return {
    stepId: step.stepId,
    title: step.title,
    rationale: step.rationale,
    intentType: step.intentType,
    status: step.status,
    approvalDecision: step.approvalDecision,
    decisionReason: step.decisionReason,
    toolCallId: step.toolCallId,
    linkedFromStepId: step.linkedFromStepId,
    code: step.code,
    codeHash: step.codeHash,
    version: step.version,
    cellIds: step.cellIds,
    requiresApproval: step.requiresApproval,
    validation: step.validation,
    lastExecuteSucceeded: step.lastExecuteSucceeded,
    lastValidateSucceeded: step.lastValidateSucceeded,
    createdAt: step.createdAt,
    updatedAt: step.updatedAt
  };
}

export function appendEvent(
  run: PreprocessingRunState,
  event: Omit<PreprocessingRunEvent, 'sequence' | 'createdAt'>
): PreprocessingRunEvent {
  const sequence = run.events.length + 1;
  const created: PreprocessingRunEvent = {
    ...event,
    sequence,
    createdAt: nowIso()
  };
  run.events.push(created);
  return created;
}

export function createStep(stepId: string): StepState {
  const timestamp = nowIso();
  return {
    stepId,
    title: 'Untitled transformation',
    intentType: 'transformation',
    status: 'pending',
    approvalDecision: 'approved',
    version: 1,
    cellIds: [],
    requiresApproval: false,
    lastExecuteSucceeded: false,
    lastValidateSucceeded: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function getOrCreateStep(run: PreprocessingRunState, explicitStepId?: string): StepState {
  const stepId = explicitStepId ?? `step-${randomUUID()}`;
  const existing = run.steps[stepId];
  if (existing) {
    return existing;
  }

  const created = createStep(stepId);
  run.steps[stepId] = created;
  return created;
}

export function getStep(run: PreprocessingRunState, stepId: string | undefined): StepState | undefined {
  if (!stepId) {
    return undefined;
  }

  return run.steps[stepId];
}

export function ensureStepExists(run: PreprocessingRunState, runId: string, stepId: string | undefined) {
  if (!stepId) {
    return fail(runId, 'MISSING_REQUIRED_ARG', 'stepId is required', {});
  }
  const step = getStep(run, stepId);
  if (!step) {
    return fail(runId, 'STEP_NOT_FOUND', `Step ${stepId} not found for run ${runId}`, { stepId });
  }
  return step;
}

export function findIncompleteBlockingStep(run: PreprocessingRunState, requestedStepId?: string): StepState | undefined {
  const NON_TERMINAL_STEP_STATUSES = new Set<StepState['status']>([
    'pending',
    'running',
    'awaiting_approval',
    'diverged'
  ]);

  return Object.values(run.steps).find((step) => {
    if (!NON_TERMINAL_STEP_STATUSES.has(step.status)) {
      return false;
    }
    if (requestedStepId && step.stepId === requestedStepId) {
      return false;
    }
    return true;
  });
}

export function toSchemaSnapshot(dataset: {
  datasetId: string;
  columns: Array<{ name: string; dtype: string }>;
}): DatasetSchemaSnapshot {
  return {
    datasetId: dataset.datasetId,
    columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
    capturedAt: nowIso()
  };
}

export function formatDatasetSummary(dataset: {
  datasetId: string;
  filename: string;
  nRows: number;
  nCols: number;
  columns: Array<{ name: string; dtype: string }>;
  sample?: Record<string, unknown>[];
}) {
  return {
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    nRows: dataset.nRows,
    nCols: dataset.nCols,
    columns: dataset.columns.map((column) => ({ name: column.name, dtype: column.dtype })),
    sample: dataset.sample?.slice(0, 5) ?? []
  };
}

export function normalizeDatasetRef(value: string): { raw: string; noExt: string } {
  const raw = value.trim().toLowerCase();
  const lastDot = raw.lastIndexOf('.');
  const noExt = lastDot > 0 ? raw.slice(0, lastDot) : raw;
  return { raw, noExt };
}

export async function resolveProjectDataset(
  datasetRepository: DatasetRepository,
  projectId: string,
  datasetRef: string
) {
  const allDatasets = await datasetRepository.list();
  const projectDatasets = allDatasets.filter((dataset) => dataset.projectId === projectId);
  const { raw, noExt } = normalizeDatasetRef(datasetRef);

  return projectDatasets.find((dataset) => {
    if (dataset.datasetId === datasetRef) {
      return true;
    }
    const normalizedFilename = normalizeDatasetRef(dataset.filename);
    return normalizedFilename.raw === raw || normalizedFilename.noExt === noExt;
  });
}

export function collectReplayEvents(run: PreprocessingRunState, checkpointEventSequence: number): PreprocessingRunEvent[] {
  return run.events.filter((event) => event.sequence <= checkpointEventSequence);
}

export function compareSchemas(
  requiredSchema: DatasetSchemaSnapshot,
  activeColumns: Array<{ name: string; dtype: string }>,
  stepId: string
) {
  const actualByName = new Map(activeColumns.map((column) => [column.name, column.dtype]));
  const issues: Array<{
    stepId: string;
    column: string;
    expectedType?: string;
    actualType?: string;
    issue: 'missing_column' | 'dtype_mismatch';
  }> = [];

  for (const required of requiredSchema.columns) {
    const actualType = actualByName.get(required.name);
    if (!actualType) {
      issues.push({
        stepId,
        column: required.name,
        expectedType: required.dtype,
        issue: 'missing_column'
      });
      continue;
    }

    if (actualType !== required.dtype) {
      issues.push({
        stepId,
        column: required.name,
        expectedType: required.dtype,
        actualType,
        issue: 'dtype_mismatch'
      });
    }
  }

  return issues;
}

export async function computeStepDivergence(
  run: PreprocessingRunState,
  step: StepState,
  inspector: PreprocessingCellInspector
): Promise<{
  isDiverged: boolean;
  details: Array<{
    stepId: string;
    cellId: string;
    issue: 'missing_cell' | 'binding_mismatch' | 'code_hash_mismatch';
    expectedCodeHash?: string;
    actualCodeHash?: string;
  }>;
  reconciledCode?: string;
  reconciledCodeHash?: string;
}> {
  const details: Array<{
    stepId: string;
    cellId: string;
    issue: 'missing_cell' | 'binding_mismatch' | 'code_hash_mismatch';
    expectedCodeHash?: string;
    actualCodeHash?: string;
  }> = [];
  let reconciledCode: string | undefined;

  for (const cellId of step.cellIds) {
    const inspected = await inspector.read(cellId);
    if (!inspected) {
      details.push({
        stepId: step.stepId,
        cellId,
        issue: 'missing_cell',
        expectedCodeHash: step.codeHash
      });
      continue;
    }

    if (!reconciledCode) {
      reconciledCode = inspected.content;
    }

    const preprocessingMetadata = asRecord(inspected.metadata.preprocessing);
    const metadataStepId = asString(preprocessingMetadata?.stepId);
    const metadataRunId = asString(preprocessingMetadata?.runId);
    if (metadataStepId !== step.stepId || metadataRunId !== run.runId) {
      details.push({
        stepId: step.stepId,
        cellId,
        issue: 'binding_mismatch',
        expectedCodeHash: step.codeHash,
        actualCodeHash: asString(preprocessingMetadata?.codeHash)
      });
      continue;
    }

    const actualCodeHash = hashCode(inspected.content);
    if (step.codeHash && step.codeHash !== actualCodeHash) {
      details.push({
        stepId: step.stepId,
        cellId,
        issue: 'code_hash_mismatch',
        expectedCodeHash: step.codeHash,
        actualCodeHash
      });
    }
  }

  return {
    isDiverged: details.length > 0,
    details,
    reconciledCode,
    reconciledCodeHash: reconciledCode ? hashCode(reconciledCode) : undefined
  };
}

export function buildPreprocessingCellMetadata(
  existing: Record<string, unknown> | undefined,
  binding: PreprocessingCellBinding
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    preprocessing: {
      source: 'preprocessing',
      runId: binding.runId,
      stepId: binding.stepId,
      toolCallId: binding.toolCallId,
      version: binding.version,
      codeHash: binding.codeHash,
      updatedAt: binding.updatedAt
    }
  };
}

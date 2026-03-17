import { asBoolean, asNumber, asRecord, asString, asStringArray } from '@/lib/typeCoercion';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import type {
  PreprocessingRunSnapshot,
  StepCellBinding,
  TransformationEvent,
  TransformationStatus
} from '@/types/preprocessing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SEMANTIC_TOOL_NAMES = new Set([
  'propose_transformation_step',
  'materialize_step_code',
  'execute_transformation_step',
  'validate_step_result',
  'commit_transformation_step',
  'detect_step_divergence',
  'reconcile_diverged_step'
]);

export const PHASE_STATUS_BY_TOOL: Record<string, TransformationStatus> = {
  propose_transformation_step: 'pending',
  materialize_step_code: 'running',
  execute_transformation_step: 'running',
  validate_step_result: 'running',
  commit_transformation_step: 'running',
  detect_step_divergence: 'running',
  reconcile_diverged_step: 'running'
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return Math.abs(hash).toString(16);
}

export function extractStepPayload(result: ToolResult): Record<string, unknown> | null {
  const output = asRecord(result.output);
  const step = asRecord(output.step);
  if (!Object.keys(step).length) {
    return null;
  }
  return {
    ...step,
    runId: asString(output.runId),
    status: asString(output.status) ?? asString(step.status)
  };
}

export function getRunIdFromToolResult(result: ToolResult): string | undefined {
  return asString(asRecord(result.output).runId);
}

export function isSemanticTool(name: string): boolean {
  return SEMANTIC_TOOL_NAMES.has(name);
}

export function inferRiskyIntent(intentType: string | undefined): boolean {
  if (!intentType) {
    return false;
  }
  const lowered = intentType.toLowerCase();
  return lowered.includes('drop') || lowered.includes('outlier') || lowered.includes('custom');
}

export function toTimestamp(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function extractReferencedColumns(code: string): string[] {
  const matches = [...code.matchAll(/\[['"]([A-Za-z0-9_ -]+)['"]\]/g)];
  return [...new Set(matches.map((match) => match[1]).filter(Boolean))];
}

export async function hashTextAuthoritative(value: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) {
    return null;
  }
  const encoded = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 24);
}

// ---------------------------------------------------------------------------
// Timeline helpers
// ---------------------------------------------------------------------------

export function upsertTimelineEvent(
  timeline: TransformationEvent[],
  incoming: TransformationEvent
): TransformationEvent[] {
  const existingIndex = timeline.findIndex((event) => event.stepId === incoming.stepId);
  if (existingIndex === -1) {
    return [...timeline, incoming].sort((a, b) => a.createdAt - b.createdAt);
  }

  const existing = timeline[existingIndex];
  const merged: TransformationEvent = {
    ...existing,
    ...incoming,
    cellIds: [...new Set([...existing.cellIds, ...incoming.cellIds])],
    createdAt: Math.min(existing.createdAt, incoming.createdAt),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt)
  };

  const next = [...timeline];
  next[existingIndex] = merged;
  return next;
}

export function buildEventFromToolCall(call: ToolCall, runId: string | null): TransformationEvent | null {
  if (!isSemanticTool(call.tool)) {
    return null;
  }

  const args = asRecord(call.args);
  const stepId = asString(args.stepId) ?? `step-${call.id}`;
  const now = Date.now();
  return {
    id: `evt-${stepId}`,
    runId: asString(args.runId) ?? runId ?? 'pending-run',
    stepId,
    toolName: call.tool,
    title: asString(args.title) ?? asString(args.intentType) ?? 'Transformation step',
    status: PHASE_STATUS_BY_TOOL[call.tool] ?? 'running',
    rationale: asString(args.rationale),
    intentType: asString(args.intentType),
    code: asString(args.code),
    codeHash: asString(args.code) ? hashText(asString(args.code) ?? '') : undefined,
    version: asNumber(args.version),
    cellIds: asStringArray(args.cellIds),
    requiresApproval: asBoolean(args.requiresApproval) ?? inferRiskyIntent(asString(args.intentType)),
    createdAt: now,
    updatedAt: now
  };
}

export function buildEventFromToolResult(
  call: ToolCall,
  result: ToolResult,
  fallbackRunId: string | null
): TransformationEvent | null {
  if (!isSemanticTool(call.tool)) {
    return null;
  }

  const step = extractStepPayload(result);
  const args = asRecord(call.args);
  const now = Date.now();
  const stepId = asString(step?.stepId) ?? asString(args.stepId) ?? `step-${call.id}`;
  const validation = step?.validation ? asRecord(step.validation) : {};

  return {
    id: `evt-${stepId}`,
    runId:
      asString(step?.runId) ??
      getRunIdFromToolResult(result) ??
      asString(args.runId) ??
      fallbackRunId ??
      'pending-run',
    stepId,
    toolName: call.tool,
    title: asString(step?.title) ?? asString(args.title) ?? asString(args.intentType) ?? 'Transformation step',
    status: result.error
      ? 'failed'
      : ((asString(step?.status) as TransformationStatus | undefined) ?? PHASE_STATUS_BY_TOOL[call.tool] ?? 'running'),
    rationale: asString(step?.rationale) ?? asString(args.rationale),
    intentType: asString(step?.intentType) ?? asString(args.intentType),
    code: asString(step?.code) ?? asString(args.code),
    codeHash: asString(step?.codeHash) ?? (asString(step?.code) ? hashText(asString(step?.code) ?? '') : undefined),
    version: asNumber(step?.version),
    cellIds: [
      ...new Set([
        ...asStringArray(step?.cellIds),
        ...asStringArray(args.cellIds),
        ...(asString(args.cellId) ? [asString(args.cellId) ?? ''] : [])
      ])
    ].filter(Boolean),
    validation: {
      rowCountBefore: asNumber(validation.rowCountBefore),
      rowCountAfter: asNumber(validation.rowCountAfter),
      nullCountBefore: asNumber(validation.nullCountBefore),
      nullCountAfter: asNumber(validation.nullCountAfter),
      schemaDrift: asBoolean(validation.schemaDrift),
      notes: asString(validation.notes)
    },
    requiresApproval: asBoolean(step?.requiresApproval) ?? asBoolean(args.requiresApproval) ?? false,
    approvalDecision: asString(step?.approvalDecision) as TransformationEvent['approvalDecision'],
    decisionReason: asString(step?.decisionReason),
    output: result.output,
    error: result.error ?? asString(step?.decisionReason),
    createdAt: now,
    updatedAt: now
  };
}

// ---------------------------------------------------------------------------
// Snapshot hydration helpers
// ---------------------------------------------------------------------------

export function buildTimelineFromSnapshot(snapshot: PreprocessingRunSnapshot): TransformationEvent[] {
  const fallbackTime = Date.now();
  return snapshot.steps
    .map((step) => ({
      id: `evt-${step.stepId}`,
      runId: snapshot.runId,
      stepId: step.stepId,
      toolName: 'snapshot_hydration',
      title: step.title,
      status: step.status,
      approvalDecision: step.approvalDecision,
      decisionReason: step.decisionReason,
      rationale: step.rationale,
      intentType: step.intentType,
      code: step.code,
      codeHash: step.codeHash,
      version: step.version,
      cellIds: step.cellIds ?? [],
      validation: step.validation,
      requiresApproval: step.requiresApproval,
      error: step.status === 'failed' ? step.decisionReason : undefined,
      createdAt: toTimestamp(step.createdAt, fallbackTime),
      updatedAt: toTimestamp(step.updatedAt, fallbackTime)
    }))
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function buildStepBindingsFromSnapshot(
  snapshot: PreprocessingRunSnapshot
): Record<string, StepCellBinding> {
  const bindings: Record<string, StepCellBinding> = {};
  const fallbackTime = Date.now();
  for (const step of snapshot.steps) {
    bindings[step.stepId] = {
      stepId: step.stepId,
      cellIds: step.cellIds ?? [],
      codeHash: step.codeHash,
      version: step.version,
      lastSyncedAt: toTimestamp(step.updatedAt, fallbackTime)
    };
  }
  return bindings;
}

export function getLatestCheckpointId(snapshot: PreprocessingRunSnapshot): string | null {
  const latest = snapshot.checkpoints[snapshot.checkpoints.length - 1] as
    | { checkpointId?: unknown }
    | undefined;
  return typeof latest?.checkpointId === 'string' && latest.checkpointId.trim()
    ? latest.checkpointId
    : null;
}

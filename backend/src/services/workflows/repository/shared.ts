import type {
  WorkflowApprovalRecord,
  WorkflowArtifactRecord,
  WorkflowEventRecord,
  WorkflowHandoffRecord,
  WorkflowNotebookBindingRecord,
  WorkflowRunState
} from '../types.js';

export function nowIso(): string {
  return new Date().toISOString();
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function asObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function mapRunRow(row: Record<string, unknown>): WorkflowRunState {
  return {
    runId: String(row.run_id),
    threadId: String(row.thread_id),
    projectId: String(row.project_id),
    phase: String(row.phase) as WorkflowRunState['phase'],
    status: String(row.status) as WorkflowRunState['status'],
    currentNode: String(row.current_node),
    revision: asNumber(row.revision),
    activeDatasetId: asString(row.active_dataset_id),
    activeNotebookId: asString(row.active_notebook_id),
    pendingInputKind: asString(row.pending_input_kind) as WorkflowRunState['pendingInputKind'],
    pauseReason: asString(row.pause_reason),
    lastFailureCode: asString(row.last_failure_code),
    lastFailureMessage: asString(row.last_failure_message),
    retryBudget: asNumber(row.retry_budget),
    repairAttemptCount: asNumber(row.repair_attempt_count),
    handoffFromArtifactId: asString(row.handoff_from_artifact_id),
    handoffToArtifactId: asString(row.handoff_to_artifact_id),
    metadata: asObject(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function mapEventRow(row: Record<string, unknown>): WorkflowEventRecord {
  return {
    eventId: String(row.event_id),
    runId: String(row.run_id),
    sequence: asNumber(row.sequence),
    eventType: String(row.event_type),
    payload: asObject(row.payload),
    createdAt: String(row.created_at)
  };
}

export function mapArtifactRow(row: Record<string, unknown>): WorkflowArtifactRecord {
  return {
    artifactId: String(row.artifact_id),
    runId: String(row.run_id),
    artifactType: String(row.artifact_type),
    label: asString(row.label),
    payload: asObject(row.payload),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function mapApprovalRow(row: Record<string, unknown>): WorkflowApprovalRecord {
  return {
    approvalId: String(row.approval_id),
    runId: String(row.run_id),
    approvalType: String(row.approval_type),
    status: String(row.status) as WorkflowApprovalRecord['status'],
    requestedAt: String(row.requested_at),
    resolvedAt: asString(row.resolved_at),
    payload: asObject(row.payload)
  };
}

export function mapHandoffRow(row: Record<string, unknown>): WorkflowHandoffRecord {
  return {
    handoffId: String(row.handoff_id),
    projectId: String(row.project_id),
    fromPhase: String(row.from_phase) as WorkflowHandoffRecord['fromPhase'],
    toPhase: String(row.to_phase) as WorkflowHandoffRecord['toPhase'],
    sourceArtifactId: String(row.source_artifact_id),
    targetArtifactId: asString(row.target_artifact_id),
    status: String(row.status) as WorkflowHandoffRecord['status'],
    payload: asObject(row.payload),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function mapNotebookBindingRow(row: Record<string, unknown>): WorkflowNotebookBindingRecord {
  const cellIds = row.cell_ids;
  const parsed = Array.isArray(cellIds)
    ? cellIds
    : typeof cellIds === 'string'
      ? JSON.parse(cellIds) as unknown[]
      : [];
  return {
    bindingId: String(row.binding_id),
    runId: String(row.run_id),
    artifactId: asString(row.artifact_id),
    stepId: asString(row.step_id),
    notebookId: asString(row.notebook_id),
    cellIds: parsed.filter((value): value is string => typeof value === 'string'),
    codeHash: asString(row.code_hash),
    bindingRevision: asNumber(row.binding_revision),
    payload: asObject(row.payload),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

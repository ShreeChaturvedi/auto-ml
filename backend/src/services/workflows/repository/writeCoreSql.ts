import type {
  WorkflowApprovalRecord,
  WorkflowArtifactRecord
} from '../types.js';

import type { WorkflowSchemaVariant } from './schemaProfile.js';

interface SqlStatement {
  text: string;
  values: unknown[];
}

const LEGACY_EVENT_TYPES = new Set([
  'run_created',
  'state_transition',
  'assistant_message',
  'tool_executed',
  'artifact_updated',
  'approval_requested',
  'approval_recorded',
  'handoff_created',
  'checkpoint_created',
  'workflow_error',
  'workflow_interrupted'
]);

function getPayloadString(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function normalizeLegacyArtifactKind(artifactType: string): string {
  switch (artifactType) {
    case 'dataset_version':
    case 'feature_pipeline':
    case 'training_candidate':
    case 'model':
    case 'notebook_binding':
    case 'checkpoint':
    case 'phase_handoff':
    case 'generic':
      return artifactType;
    default:
      return 'generic';
  }
}

function normalizeLegacyEvent(
  eventType: string,
  payload: Record<string, unknown>
): {
  type: string;
  status: string | null;
  payload: Record<string, unknown>;
} {
  const normalizedPayload = { ...payload, eventType };
  const explicitStatus = typeof payload.status === 'string' ? payload.status : null;

  switch (eventType) {
    case 'workflow_turn_started':
      return { type: 'run_created', status: 'running', payload: normalizedPayload };
    case 'workflow_completed':
      return { type: 'state_transition', status: 'completed', payload: normalizedPayload };
    case 'workflow_paused':
      return { type: 'state_transition', status: 'paused', payload: normalizedPayload };
    case 'workflow_failed':
      return { type: 'workflow_error', status: explicitStatus ?? 'failed_retryable', payload: normalizedPayload };
    default:
      return {
        type: LEGACY_EVENT_TYPES.has(eventType) ? eventType : 'state_transition',
        status: explicitStatus,
        payload: normalizedPayload
      };
  }
}

export function buildAppendEventSql(
  variant: WorkflowSchemaVariant,
  params: {
    eventId: string;
    runId: string;
    sequence: number;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }
): SqlStatement {
  if (variant === 'canonical') {
    return {
      text: `INSERT INTO workflow_events (event_id, run_id, sequence, event_type, payload, created_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6)
             RETURNING *`,
      values: [
        params.eventId,
        params.runId,
        params.sequence,
        params.eventType,
        getPayloadString(params.payload),
        params.createdAt
      ]
    };
  }

  const normalized = normalizeLegacyEvent(params.eventType, params.payload);
  return {
    text: `INSERT INTO workflow_events (event_id, run_id, sequence, type, node, status, payload, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
           RETURNING event_id, run_id, sequence, type AS event_type, payload, created_at`,
    values: [
      params.eventId,
      params.runId,
      params.sequence,
      normalized.type,
      typeof params.payload.node === 'string' ? params.payload.node : null,
      normalized.status,
      getPayloadString(normalized.payload),
      params.createdAt
    ]
  };
}

export function buildArtifactUpsertSql(
  variant: WorkflowSchemaVariant,
  input: Omit<WorkflowArtifactRecord, 'createdAt' | 'updatedAt'>,
  timestamp: string
): SqlStatement {
  if (variant === 'canonical') {
    return {
      text: `INSERT INTO workflow_artifacts (artifact_id, run_id, artifact_type, label, payload, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
             ON CONFLICT (artifact_id) DO UPDATE
             SET run_id = EXCLUDED.run_id,
                 artifact_type = EXCLUDED.artifact_type,
                 label = EXCLUDED.label,
                 payload = EXCLUDED.payload,
                 updated_at = EXCLUDED.updated_at
             RETURNING *`,
      values: [
        input.artifactId,
        input.runId,
        input.artifactType,
        input.label ?? null,
        getPayloadString(input.payload),
        timestamp,
        timestamp
      ]
    };
  }

  const legacyKind = normalizeLegacyArtifactKind(input.artifactType);
  return {
    text: `INSERT INTO workflow_artifacts (artifact_id, run_id, phase, kind, status, name, source_key, payload, created_at, updated_at)
           VALUES (
             $1, $2,
             (SELECT phase FROM workflow_runs WHERE run_id = $2),
             $3, $4, $5, $6, $7::jsonb, $8, $9
           )
           ON CONFLICT (artifact_id) DO UPDATE
           SET run_id = EXCLUDED.run_id,
               phase = EXCLUDED.phase,
               kind = EXCLUDED.kind,
               status = EXCLUDED.status,
               name = EXCLUDED.name,
               source_key = EXCLUDED.source_key,
               payload = EXCLUDED.payload,
               updated_at = EXCLUDED.updated_at
           RETURNING artifact_id, run_id, kind AS artifact_type, name AS label, payload, created_at, updated_at`,
    values: [
      input.artifactId,
      input.runId,
      legacyKind,
      'ready',
      input.label ?? null,
      input.artifactType,
      getPayloadString(input.payload),
      timestamp,
      timestamp
    ]
  };
}

export function buildApprovalUpsertSql(
  variant: WorkflowSchemaVariant,
  input: Omit<WorkflowApprovalRecord, 'requestedAt'> & { requestedAt?: string },
  requestedAt: string
): SqlStatement {
  if (variant === 'canonical') {
    return {
      text: `INSERT INTO workflow_approvals (approval_id, run_id, approval_type, status, requested_at, resolved_at, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
             ON CONFLICT (approval_id) DO UPDATE
             SET status = EXCLUDED.status,
                 resolved_at = EXCLUDED.resolved_at,
                 payload = EXCLUDED.payload
             RETURNING *`,
      values: [
        input.approvalId,
        input.runId,
        input.approvalType,
        input.status,
        requestedAt,
        input.resolvedAt ?? null,
        getPayloadString(input.payload)
      ]
    };
  }

  return {
    text: `INSERT INTO workflow_approvals (approval_id, run_id, phase, gate, artifact_id, decision, decided_by, comment, payload, created_at, updated_at)
           VALUES (
             $1, $2,
             (SELECT phase FROM workflow_runs WHERE run_id = $2),
             $3, $4, $5, $6, $7, $8::jsonb, $9, $10
           )
           ON CONFLICT (approval_id) DO UPDATE
           SET artifact_id = EXCLUDED.artifact_id,
               decision = EXCLUDED.decision,
               decided_by = EXCLUDED.decided_by,
               comment = EXCLUDED.comment,
               payload = EXCLUDED.payload,
               updated_at = EXCLUDED.updated_at
           RETURNING approval_id, run_id, gate AS approval_type, decision AS status,
                     created_at AS requested_at, updated_at AS resolved_at, payload`,
    values: [
      input.approvalId,
      input.runId,
      input.approvalType,
      typeof input.payload.artifactId === 'string' ? input.payload.artifactId : null,
      input.status,
      typeof input.payload.decidedBy === 'string' ? input.payload.decidedBy : null,
      typeof input.payload.comment === 'string' ? input.payload.comment : null,
      getPayloadString(input.payload),
      requestedAt,
      input.resolvedAt ?? requestedAt
    ]
  };
}

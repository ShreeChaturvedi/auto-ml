import type {
  WorkflowApprovalRecord,
  WorkflowArtifactRecord
} from '../types.js';
import { getPayloadString, type SqlStatement } from './shared.js';

export function buildAppendEventSql(
  params: {
    eventId: string;
    runId: string;
    sequence: number;
    eventType: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }
): SqlStatement {
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

export function buildArtifactUpsertSql(
  input: Omit<WorkflowArtifactRecord, 'createdAt' | 'updatedAt'>,
  timestamp: string
): SqlStatement {
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

export function buildApprovalUpsertSql(
  input: Omit<WorkflowApprovalRecord, 'requestedAt'> & { requestedAt?: string },
  requestedAt: string
): SqlStatement {
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

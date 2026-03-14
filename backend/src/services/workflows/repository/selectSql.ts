import type { WorkflowSchemaVariant } from './schemaProfile.js';

export function buildEventSelectSql(variant: WorkflowSchemaVariant): string {
  return variant === 'canonical'
    ? 'SELECT event_id, run_id, sequence, event_type, payload, created_at FROM workflow_events WHERE run_id = $1 ORDER BY sequence ASC'
    : 'SELECT event_id, run_id, sequence, type AS event_type, payload, created_at FROM workflow_events WHERE run_id = $1 ORDER BY sequence ASC';
}

export function buildArtifactSelectSql(variant: WorkflowSchemaVariant): string {
  return variant === 'canonical'
    ? 'SELECT artifact_id, run_id, artifact_type, label, payload, created_at, updated_at FROM workflow_artifacts WHERE run_id = $1 ORDER BY created_at ASC'
    : 'SELECT artifact_id, run_id, kind AS artifact_type, name AS label, payload, created_at, updated_at FROM workflow_artifacts WHERE run_id = $1 ORDER BY created_at ASC';
}

export function buildApprovalSelectSql(variant: WorkflowSchemaVariant): string {
  return variant === 'canonical'
    ? 'SELECT approval_id, run_id, approval_type, status, requested_at, resolved_at, payload FROM workflow_approvals WHERE run_id = $1 ORDER BY requested_at ASC'
    : `SELECT approval_id, run_id, gate AS approval_type, decision AS status,
              created_at AS requested_at, updated_at AS resolved_at, payload
       FROM workflow_approvals
       WHERE run_id = $1
       ORDER BY created_at ASC`;
}

export function buildHandoffSelectSql(variant: WorkflowSchemaVariant): string {
  return variant === 'canonical'
    ? 'SELECT handoff_id, project_id, from_phase, to_phase, source_artifact_id, target_artifact_id, status, payload, created_at, updated_at FROM workflow_handoffs WHERE project_id = $1 ORDER BY created_at ASC'
    : `SELECT handoff_id, h.project_id,
              COALESCE(h.payload->>'fromPhase', runs.phase) AS from_phase,
              h.target_phase AS to_phase,
              h.source_artifact_id,
              h.payload->>'targetArtifactId' AS target_artifact_id,
              h.status,
              h.payload,
              h.created_at,
              h.updated_at
       FROM workflow_handoffs h
       LEFT JOIN workflow_runs runs ON runs.run_id = h.source_run_id
       WHERE h.project_id = $1
       ORDER BY h.created_at ASC`;
}

export function buildNotebookBindingSelectSql(variant: WorkflowSchemaVariant): string {
  return variant === 'canonical'
    ? `SELECT binding_id, run_id, artifact_id, step_id, notebook_id, cell_ids,
              code_hash, binding_revision, payload, created_at, updated_at
       FROM workflow_notebook_bindings
       WHERE run_id = $1
       ORDER BY created_at ASC`
    : `SELECT binding_id, run_id,
              payload->>'artifactId' AS artifact_id,
              payload->>'stepId' AS step_id,
              notebook_id,
              CASE
                WHEN cell_id IS NULL THEN '[]'::jsonb
                ELSE jsonb_build_array(cell_id::text)
              END AS cell_ids,
              code_hash,
              revision AS binding_revision,
              payload,
              created_at,
              updated_at
       FROM workflow_notebook_bindings
       WHERE run_id = $1
       ORDER BY created_at ASC`;
}

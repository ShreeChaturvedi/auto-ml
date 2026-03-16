export function buildEventSelectSql(): string {
  return 'SELECT event_id, run_id, sequence, event_type, payload, created_at FROM workflow_events WHERE run_id = $1 ORDER BY sequence ASC';
}

export function buildArtifactSelectSql(): string {
  return 'SELECT artifact_id, run_id, artifact_type, label, payload, created_at, updated_at FROM workflow_artifacts WHERE run_id = $1 ORDER BY created_at ASC';
}

export function buildApprovalSelectSql(): string {
  return 'SELECT approval_id, run_id, approval_type, status, requested_at, resolved_at, payload FROM workflow_approvals WHERE run_id = $1 ORDER BY requested_at ASC';
}

export function buildHandoffSelectSql(): string {
  return 'SELECT handoff_id, project_id, from_phase, to_phase, source_artifact_id, target_artifact_id, status, payload, created_at, updated_at FROM workflow_handoffs WHERE project_id = $1 ORDER BY created_at ASC';
}

export function buildNotebookBindingSelectSql(): string {
  return `SELECT binding_id, run_id, artifact_id, step_id, notebook_id, cell_ids,
            code_hash, binding_revision, payload, created_at, updated_at
     FROM workflow_notebook_bindings
     WHERE run_id = $1
     ORDER BY created_at ASC`;
}

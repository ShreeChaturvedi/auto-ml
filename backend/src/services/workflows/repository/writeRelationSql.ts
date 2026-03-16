import type {
  WorkflowHandoffRecord,
  WorkflowNotebookBindingRecord
} from '../types.js';
import { getPayloadString, type SqlStatement } from './shared.js';

export function buildHandoffUpsertSql(
  input: Omit<WorkflowHandoffRecord, 'createdAt' | 'updatedAt'>,
  timestamp: string
): SqlStatement {
  return {
    text: `INSERT INTO workflow_handoffs (
             handoff_id, project_id, from_phase, to_phase, source_artifact_id, target_artifact_id, status, payload, created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10
           )
           ON CONFLICT (handoff_id) DO UPDATE
           SET target_artifact_id = EXCLUDED.target_artifact_id,
               status = EXCLUDED.status,
               payload = EXCLUDED.payload,
               updated_at = EXCLUDED.updated_at
           RETURNING *`,
    values: [
      input.handoffId,
      input.projectId,
      input.fromPhase,
      input.toPhase,
      input.sourceArtifactId,
      input.targetArtifactId ?? null,
      input.status,
      getPayloadString(input.payload),
      timestamp,
      timestamp
    ]
  };
}

export function buildNotebookBindingUpsertSql(
  input: Omit<WorkflowNotebookBindingRecord, 'createdAt' | 'updatedAt'>,
  timestamp: string
): SqlStatement {
  return {
    text: `INSERT INTO workflow_notebook_bindings (
             binding_id, run_id, artifact_id, step_id, notebook_id, cell_ids, code_hash, binding_revision, payload, created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10,$11
           )
           ON CONFLICT (binding_id) DO UPDATE
           SET artifact_id = EXCLUDED.artifact_id,
               step_id = EXCLUDED.step_id,
               notebook_id = EXCLUDED.notebook_id,
               cell_ids = EXCLUDED.cell_ids,
               code_hash = EXCLUDED.code_hash,
               binding_revision = EXCLUDED.binding_revision,
               payload = EXCLUDED.payload,
               updated_at = EXCLUDED.updated_at
           RETURNING *`,
    values: [
      input.bindingId,
      input.runId,
      input.artifactId ?? null,
      input.stepId ?? null,
      input.notebookId ?? null,
      JSON.stringify(input.cellIds),
      input.codeHash ?? null,
      input.bindingRevision,
      getPayloadString(input.payload),
      timestamp,
      timestamp
    ]
  };
}

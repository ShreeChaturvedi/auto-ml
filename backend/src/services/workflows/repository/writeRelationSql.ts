import type {
  WorkflowHandoffRecord,
  WorkflowNotebookBindingRecord
} from '../types.js';

import type { WorkflowSchemaVariant } from './schemaProfile.js';

interface SqlStatement {
  text: string;
  values: unknown[];
}

function getPayloadString(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

export function buildHandoffUpsertSql(
  variant: WorkflowSchemaVariant,
  input: Omit<WorkflowHandoffRecord, 'createdAt' | 'updatedAt'>,
  timestamp: string
): SqlStatement {
  if (variant === 'canonical') {
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

  return {
    text: `INSERT INTO workflow_handoffs (
               handoff_id, project_id, source_run_id, source_artifact_id, target_phase, target_run_id, status, payload, created_at, updated_at
             ) VALUES (
               $1,$2,
               COALESCE(($3)::uuid, (SELECT run_id FROM workflow_artifacts WHERE artifact_id = $4)),
               $4,$5,$6,$7,$8::jsonb,$9,$10
             )
             ON CONFLICT (handoff_id) DO UPDATE
             SET target_run_id = EXCLUDED.target_run_id,
                 status = EXCLUDED.status,
                 payload = EXCLUDED.payload,
                 updated_at = EXCLUDED.updated_at
             RETURNING handoff_id, project_id,
                       COALESCE(payload->>'fromPhase', (SELECT phase FROM workflow_runs WHERE run_id = source_run_id)) AS from_phase,
                       target_phase AS to_phase,
                       source_artifact_id,
                       payload->>'targetArtifactId' AS target_artifact_id,
                       status, payload, created_at, updated_at`,
    values: [
      input.handoffId,
      input.projectId,
      typeof input.payload.sourceRunId === 'string' ? input.payload.sourceRunId : null,
      input.sourceArtifactId,
      input.toPhase,
      typeof input.payload.targetRunId === 'string' ? input.payload.targetRunId : null,
      input.status,
      getPayloadString(input.payload),
      timestamp,
      timestamp
    ]
  };
}

export function buildNotebookBindingUpsertSql(
  variant: WorkflowSchemaVariant,
  input: Omit<WorkflowNotebookBindingRecord, 'createdAt' | 'updatedAt'>,
  timestamp: string
): SqlStatement {
  if (variant === 'canonical') {
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

  return {
    text: `INSERT INTO workflow_notebook_bindings (
               binding_id, run_id, phase, notebook_id, cell_id, binding_key, code_hash, revision, payload, verified_at, created_at, updated_at
             ) VALUES (
               $1,$2,(SELECT phase FROM workflow_runs WHERE run_id = $2),$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11
             )
             ON CONFLICT (binding_id) DO UPDATE
             SET notebook_id = EXCLUDED.notebook_id,
                 cell_id = EXCLUDED.cell_id,
                 binding_key = EXCLUDED.binding_key,
                 code_hash = EXCLUDED.code_hash,
                 revision = EXCLUDED.revision,
                 payload = EXCLUDED.payload,
                 verified_at = EXCLUDED.verified_at,
                 updated_at = EXCLUDED.updated_at
             RETURNING binding_id, run_id,
                       payload->>'artifactId' AS artifact_id,
                       payload->>'stepId' AS step_id,
                       notebook_id,
                       CASE WHEN cell_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(cell_id::text) END AS cell_ids,
                       code_hash,
                       revision AS binding_revision,
                       payload, created_at, updated_at`,
    values: [
      input.bindingId,
      input.runId,
      input.notebookId,
      input.cellIds[0] ?? null,
      input.stepId ?? input.artifactId ?? input.bindingId,
      input.codeHash ?? null,
      input.bindingRevision,
      getPayloadString({
        ...input.payload,
        artifactId: input.artifactId ?? input.payload.artifactId,
        stepId: input.stepId ?? input.payload.stepId,
        cellIds: input.cellIds
      }),
      timestamp,
      timestamp,
      timestamp
    ]
  };
}

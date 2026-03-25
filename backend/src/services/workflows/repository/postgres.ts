import { randomUUID } from 'node:crypto';

import { getDbPool } from '../../../db.js';
import type {
  WorkflowApprovalRecord,
  WorkflowArtifactRecord,
  WorkflowEventRecord,
  WorkflowHandoffRecord,
  WorkflowNotebookBindingRecord,
  WorkflowRunSnapshot,
  WorkflowRunState
} from '../types.js';

import {
  buildApprovalSelectSql,
  buildArtifactSelectSql,
  buildEventSelectSql,
  buildHandoffSelectSql,
  buildNotebookBindingSelectSql
} from './selectSql.js';
import {
  mapApprovalRow,
  mapArtifactRow,
  mapEventRow,
  mapHandoffRow,
  mapNotebookBindingRow,
  mapRunRow,
  nowIso
} from './shared.js';
import type { WorkflowRepository } from './types.js';
import {
  buildApprovalUpsertSql,
  buildArtifactUpsertSql,
  buildAppendEventSql
} from './writeCoreSql.js';
import {
  buildHandoffUpsertSql,
  buildNotebookBindingUpsertSql
} from './writeRelationSql.js';

export class PostgresWorkflowRepository implements WorkflowRepository {
  async createRun(input: Omit<WorkflowRunState, 'createdAt' | 'updatedAt' | 'revision'>): Promise<WorkflowRunState> {
    const pool = getDbPool();
    const timestamp = nowIso();
    const result = await pool.query(
      `INSERT INTO workflow_runs (
        run_id, thread_id, project_id, phase, status, current_node, revision,
        active_dataset_id, active_notebook_id, pending_input_kind, pause_reason,
        last_failure_code, last_failure_message, retry_budget, repair_attempt_count,
        handoff_from_artifact_id, handoff_to_artifact_id, metadata, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,
        $12,$13,$14,$15,
        $16,$17,$18::jsonb,$19,$20
      )
      RETURNING *`,
      [
        input.runId,
        input.threadId,
        input.projectId,
        input.phase,
        input.status,
        input.currentNode,
        1,
        input.activeDatasetId ?? null,
        input.activeNotebookId ?? null,
        input.pendingInputKind ?? null,
        input.pauseReason ?? null,
        input.lastFailureCode ?? null,
        input.lastFailureMessage ?? null,
        input.retryBudget,
        input.repairAttemptCount,
        input.handoffFromArtifactId ?? null,
        input.handoffToArtifactId ?? null,
        JSON.stringify(input.metadata ?? {}),
        timestamp,
        timestamp
      ]
    );
    return mapRunRow(result.rows[0] as Record<string, unknown>);
  }

  async getRun(runId: string): Promise<WorkflowRunSnapshot | undefined> {
    const pool = getDbPool();
    const runResult = await pool.query('SELECT * FROM workflow_runs WHERE run_id = $1', [runId]);
    if (runResult.rows.length === 0) {
      return undefined;
    }

    const [eventsResult, artifactsResult, approvalsResult, bindingsResult] = await Promise.all([
      pool.query(buildEventSelectSql(), [runId]),
      pool.query(buildArtifactSelectSql(), [runId]),
      pool.query(buildApprovalSelectSql(), [runId]),
      pool.query(buildNotebookBindingSelectSql(), [runId])
    ]);

    const handoffsResult = await pool.query(buildHandoffSelectSql(), [runResult.rows[0].project_id]);

    return {
      run: mapRunRow(runResult.rows[0] as Record<string, unknown>),
      events: eventsResult.rows.map((row) => mapEventRow(row as Record<string, unknown>)),
      artifacts: artifactsResult.rows.map((row) => mapArtifactRow(row as Record<string, unknown>)),
      approvals: approvalsResult.rows.map((row) => mapApprovalRow(row as Record<string, unknown>)),
      handoffs: handoffsResult.rows.map((row) => mapHandoffRow(row as Record<string, unknown>)),
      notebookBindings: bindingsResult.rows.map((row) => mapNotebookBindingRow(row as Record<string, unknown>))
    };
  }

  async listRuns(projectId: string, phase?: WorkflowRunState['phase']): Promise<WorkflowRunState[]> {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT * FROM workflow_runs
       WHERE project_id = $1 AND ($2::text IS NULL OR phase = $2)
       ORDER BY updated_at DESC`,
      [projectId, phase ?? null]
    );
    return result.rows.map((row) => mapRunRow(row as Record<string, unknown>));
  }

  async saveRun(run: WorkflowRunState): Promise<WorkflowRunState> {
    const pool = getDbPool();
    const timestamp = nowIso();
    const result = await pool.query(
      `UPDATE workflow_runs
       SET thread_id = $2,
           status = $3,
           current_node = $4,
           revision = $5,
           active_dataset_id = $6,
           active_notebook_id = $7,
           pending_input_kind = $8,
           pause_reason = $9,
           last_failure_code = $10,
           last_failure_message = $11,
           retry_budget = $12,
           repair_attempt_count = $13,
           handoff_from_artifact_id = $14,
           handoff_to_artifact_id = $15,
           metadata = $16::jsonb,
           updated_at = $17
       WHERE run_id = $1
       RETURNING *`,
      [
        run.runId,
        run.threadId,
        run.status,
        run.currentNode,
        run.revision + 1,
        run.activeDatasetId ?? null,
        run.activeNotebookId ?? null,
        run.pendingInputKind ?? null,
        run.pauseReason ?? null,
        run.lastFailureCode ?? null,
        run.lastFailureMessage ?? null,
        run.retryBudget,
        run.repairAttemptCount,
        run.handoffFromArtifactId ?? null,
        run.handoffToArtifactId ?? null,
        JSON.stringify(run.metadata ?? {}),
        timestamp
      ]
    );
    return mapRunRow(result.rows[0] as Record<string, unknown>);
  }

  async appendEvent(runId: string, eventType: string, payload: Record<string, unknown>): Promise<WorkflowEventRecord> {
    const pool = getDbPool();
    const eventId = randomUUID();
    const sequenceResult = await pool.query(
      'SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM workflow_events WHERE run_id = $1',
      [runId]
    );
    const nextSequence = Number(sequenceResult.rows[0]?.next_sequence ?? 1);
    const statement = buildAppendEventSql({
      eventId,
      runId,
      sequence: nextSequence,
      eventType,
      payload,
      createdAt: nowIso()
    });
    const result = await pool.query(statement.text, statement.values);
    return mapEventRow(result.rows[0] as Record<string, unknown>);
  }

  async upsertArtifact(input: Omit<WorkflowArtifactRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowArtifactRecord> {
    const pool = getDbPool();
    const timestamp = nowIso();
    const statement = buildArtifactUpsertSql(input, timestamp);
    const result = await pool.query(statement.text, statement.values);
    return mapArtifactRow(result.rows[0] as Record<string, unknown>);
  }

  async upsertApproval(input: Omit<WorkflowApprovalRecord, 'requestedAt'> & { requestedAt?: string }): Promise<WorkflowApprovalRecord> {
    const pool = getDbPool();
    const requestedAt = input.requestedAt ?? nowIso();
    const statement = buildApprovalUpsertSql(input, requestedAt);
    const result = await pool.query(statement.text, statement.values);
    return mapApprovalRow(result.rows[0] as Record<string, unknown>);
  }

  async upsertHandoff(input: Omit<WorkflowHandoffRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowHandoffRecord> {
    const pool = getDbPool();
    const timestamp = nowIso();
    const statement = buildHandoffUpsertSql(input, timestamp);
    const result = await pool.query(statement.text, statement.values);
    return mapHandoffRow(result.rows[0] as Record<string, unknown>);
  }

  async upsertNotebookBinding(input: Omit<WorkflowNotebookBindingRecord, 'createdAt' | 'updatedAt'>): Promise<WorkflowNotebookBindingRecord> {
    const pool = getDbPool();
    const timestamp = nowIso();
    const statement = buildNotebookBindingUpsertSql(input, timestamp);
    const result = await pool.query(statement.text, statement.values);
    return mapNotebookBindingRow(result.rows[0] as Record<string, unknown>);
  }

  async findActiveRun(projectId: string, phase: string): Promise<WorkflowRunState | undefined> {
    const pool = getDbPool();
    const result = await pool.query(
      `SELECT * FROM workflow_runs
       WHERE project_id = $1 AND phase = $2 AND status = 'running'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [projectId, phase]
    );
    if (result.rows.length === 0) return undefined;
    return mapRunRow(result.rows[0] as Record<string, unknown>);
  }
}

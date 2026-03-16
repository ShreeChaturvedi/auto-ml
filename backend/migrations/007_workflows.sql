CREATE TABLE IF NOT EXISTS workflow_runs (
  run_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  current_node TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  active_dataset_id TEXT,
  active_notebook_id TEXT,
  pending_input_kind TEXT,
  pause_reason TEXT,
  last_failure_code TEXT,
  last_failure_message TEXT,
  retry_budget INTEGER NOT NULL DEFAULT 3,
  repair_attempt_count INTEGER NOT NULL DEFAULT 0,
  handoff_from_artifact_id TEXT,
  handoff_to_artifact_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase, status, and pending_input_kind constraints.
-- Use DROP + ADD so the migration remains idempotent when phases expand.
DO $$ BEGIN
  ALTER TABLE workflow_runs DROP CONSTRAINT IF EXISTS workflow_runs_phase_check;
  ALTER TABLE workflow_runs ADD CONSTRAINT workflow_runs_phase_check
    CHECK (phase IN ('preprocessing', 'feature_engineering', 'training', 'onboarding'));

  ALTER TABLE workflow_runs DROP CONSTRAINT IF EXISTS workflow_runs_status_check;
  ALTER TABLE workflow_runs ADD CONSTRAINT workflow_runs_status_check
    CHECK (status IN ('running', 'paused', 'failed_retryable', 'failed_terminal', 'completed', 'interrupted'));

  ALTER TABLE workflow_runs DROP CONSTRAINT IF EXISTS workflow_runs_pending_input_kind_check;
  ALTER TABLE workflow_runs ADD CONSTRAINT workflow_runs_pending_input_kind_check
    CHECK (pending_input_kind IN ('approval', 'clarification', 'selection', 'edit_review'));
END $$;

CREATE INDEX IF NOT EXISTS workflow_runs_project_phase_idx
  ON workflow_runs (project_id, phase, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, sequence)
);

CREATE INDEX IF NOT EXISTS workflow_events_run_sequence_idx
  ON workflow_events (run_id, sequence ASC);

CREATE TABLE IF NOT EXISTS workflow_artifacts (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  label TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workflow_artifacts_run_type_idx
  ON workflow_artifacts (run_id, artifact_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_approvals (
  approval_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS workflow_approvals_run_status_idx
  ON workflow_approvals (run_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS workflow_handoffs (
  handoff_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  source_artifact_id TEXT NOT NULL,
  target_artifact_id TEXT,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workflow_handoffs_project_idx
  ON workflow_handoffs (project_id, from_phase, to_phase, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_notebook_bindings (
  binding_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  artifact_id TEXT,
  step_id TEXT,
  notebook_id TEXT,
  cell_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  code_hash TEXT,
  binding_revision INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workflow_notebook_bindings_run_idx
  ON workflow_notebook_bindings (run_id, updated_at DESC);

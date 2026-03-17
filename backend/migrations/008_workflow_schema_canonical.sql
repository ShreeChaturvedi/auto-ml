-- 008_workflow_schema_canonical.sql
-- Migrates all 5 workflow tables from legacy schema to canonical schema.
-- Fully idempotent: safe to re-run on legacy, partially-migrated, or already-canonical databases.
-- NOTE: workflow_runs is intentionally untouched (already canonical with onboarding phase).

--------------------------------------------------------------------------------
-- 1. workflow_events
--    Legacy columns: type, node, status
--    Canonical column: event_type
--    Legacy constraints: workflow_events_type_check, workflow_events_status_check
--    Legacy indexes: idx_workflow_events_run_sequence
--------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_events' AND column_name = 'event_type'
  ) THEN
    -- Add the canonical column
    ALTER TABLE workflow_events ADD COLUMN event_type TEXT;

    -- Backfill from legacy 'type' column
    UPDATE workflow_events SET event_type = COALESCE(type, 'state_transition');

    -- Make NOT NULL
    ALTER TABLE workflow_events ALTER COLUMN event_type SET NOT NULL;

    -- Drop legacy check constraints before dropping the columns they reference
    ALTER TABLE workflow_events DROP CONSTRAINT IF EXISTS workflow_events_type_check;
    ALTER TABLE workflow_events DROP CONSTRAINT IF EXISTS workflow_events_status_check;

    -- Drop legacy columns
    ALTER TABLE workflow_events DROP COLUMN IF EXISTS type;
    ALTER TABLE workflow_events DROP COLUMN IF EXISTS node;
    ALTER TABLE workflow_events DROP COLUMN IF EXISTS status;
  ELSE
    -- Already canonical; clean up any leftover legacy constraints and columns
    ALTER TABLE workflow_events DROP CONSTRAINT IF EXISTS workflow_events_type_check;
    ALTER TABLE workflow_events DROP CONSTRAINT IF EXISTS workflow_events_status_check;
    ALTER TABLE workflow_events DROP COLUMN IF EXISTS type;
    ALTER TABLE workflow_events DROP COLUMN IF EXISTS node;
    ALTER TABLE workflow_events DROP COLUMN IF EXISTS status;
  END IF;
END $$;

-- Drop legacy index, rebuild canonical index
DROP INDEX IF EXISTS idx_workflow_events_run_sequence;
DROP INDEX IF EXISTS workflow_events_run_sequence_idx;
CREATE INDEX IF NOT EXISTS workflow_events_run_sequence_idx
  ON workflow_events (run_id, sequence ASC);

--------------------------------------------------------------------------------
-- 2. workflow_artifacts
--    Legacy columns: phase, kind, status, name, source_key
--    Canonical columns: artifact_type, label
--    Legacy constraints: workflow_artifacts_phase_check, workflow_artifacts_kind_check,
--                        workflow_artifacts_status_check
--    Legacy indexes: idx_workflow_artifacts_run
--------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_artifacts' AND column_name = 'artifact_type'
  ) THEN
    -- Add canonical columns
    ALTER TABLE workflow_artifacts ADD COLUMN artifact_type TEXT;
    ALTER TABLE workflow_artifacts ADD COLUMN label TEXT;

    -- Backfill from legacy columns
    UPDATE workflow_artifacts
    SET artifact_type = COALESCE(kind, 'generic'),
        label = name;

    -- Make artifact_type NOT NULL
    ALTER TABLE workflow_artifacts ALTER COLUMN artifact_type SET NOT NULL;

    -- Drop legacy check constraints
    ALTER TABLE workflow_artifacts DROP CONSTRAINT IF EXISTS workflow_artifacts_phase_check;
    ALTER TABLE workflow_artifacts DROP CONSTRAINT IF EXISTS workflow_artifacts_kind_check;
    ALTER TABLE workflow_artifacts DROP CONSTRAINT IF EXISTS workflow_artifacts_status_check;

    -- Drop legacy columns
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS phase;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS kind;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS status;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS name;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS source_key;
  ELSE
    -- Already canonical; clean up any leftover legacy constraints and columns
    ALTER TABLE workflow_artifacts DROP CONSTRAINT IF EXISTS workflow_artifacts_phase_check;
    ALTER TABLE workflow_artifacts DROP CONSTRAINT IF EXISTS workflow_artifacts_kind_check;
    ALTER TABLE workflow_artifacts DROP CONSTRAINT IF EXISTS workflow_artifacts_status_check;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS phase;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS kind;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS status;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS name;
    ALTER TABLE workflow_artifacts DROP COLUMN IF EXISTS source_key;
  END IF;
END $$;

-- Drop legacy index, rebuild canonical index
DROP INDEX IF EXISTS idx_workflow_artifacts_run;
DROP INDEX IF EXISTS workflow_artifacts_run_type_idx;
CREATE INDEX IF NOT EXISTS workflow_artifacts_run_type_idx
  ON workflow_artifacts (run_id, artifact_type, updated_at DESC);

--------------------------------------------------------------------------------
-- 3. workflow_approvals
--    Legacy columns: phase, gate, artifact_id, decision, decided_by, comment,
--                    created_at (maps to requested_at), updated_at (maps to resolved_at)
--    Canonical columns: approval_type, status, requested_at, resolved_at
--    Legacy constraints: workflow_approvals_phase_check, workflow_approvals_gate_check,
--                        workflow_approvals_decision_check,
--                        workflow_approvals_artifact_id_fkey (FK to workflow_artifacts)
--    Legacy indexes: idx_workflow_approvals_run
--------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_approvals' AND column_name = 'approval_type'
  ) THEN
    -- Add canonical columns
    ALTER TABLE workflow_approvals ADD COLUMN approval_type TEXT;
    ALTER TABLE workflow_approvals ADD COLUMN status TEXT;
    ALTER TABLE workflow_approvals ADD COLUMN requested_at TIMESTAMPTZ;
    ALTER TABLE workflow_approvals ADD COLUMN resolved_at TIMESTAMPTZ;

    -- Backfill from legacy columns
    UPDATE workflow_approvals
    SET approval_type = COALESCE(gate, 'unknown'),
        status = COALESCE(decision, 'pending'),
        requested_at = COALESCE(created_at, NOW()),
        resolved_at = CASE WHEN decision IS NOT NULL THEN updated_at ELSE NULL END;

    -- Make NOT NULL where required
    ALTER TABLE workflow_approvals ALTER COLUMN approval_type SET NOT NULL;
    ALTER TABLE workflow_approvals ALTER COLUMN status SET NOT NULL;
    ALTER TABLE workflow_approvals ALTER COLUMN requested_at SET NOT NULL;
    ALTER TABLE workflow_approvals ALTER COLUMN requested_at SET DEFAULT NOW();

    -- Drop legacy check constraints
    ALTER TABLE workflow_approvals DROP CONSTRAINT IF EXISTS workflow_approvals_phase_check;
    ALTER TABLE workflow_approvals DROP CONSTRAINT IF EXISTS workflow_approvals_gate_check;
    ALTER TABLE workflow_approvals DROP CONSTRAINT IF EXISTS workflow_approvals_decision_check;

    -- Drop legacy foreign key on artifact_id before dropping the column
    ALTER TABLE workflow_approvals DROP CONSTRAINT IF EXISTS workflow_approvals_artifact_id_fkey;

    -- Drop legacy columns (created_at/updated_at are replaced by requested_at/resolved_at)
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS phase;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS gate;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS artifact_id;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS decision;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS decided_by;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS comment;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS created_at;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS updated_at;

    -- Drop the update trigger since updated_at no longer exists
    DROP TRIGGER IF EXISTS workflow_approvals_updated_at ON workflow_approvals;
  ELSE
    -- Already canonical; clean up any leftover legacy constraints and columns
    ALTER TABLE workflow_approvals DROP CONSTRAINT IF EXISTS workflow_approvals_phase_check;
    ALTER TABLE workflow_approvals DROP CONSTRAINT IF EXISTS workflow_approvals_gate_check;
    ALTER TABLE workflow_approvals DROP CONSTRAINT IF EXISTS workflow_approvals_decision_check;
    ALTER TABLE workflow_approvals DROP CONSTRAINT IF EXISTS workflow_approvals_artifact_id_fkey;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS phase;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS gate;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS artifact_id;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS decision;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS decided_by;
    ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS comment;
    -- Only drop created_at/updated_at if canonical columns exist (they do, since we're in ELSE)
    -- and legacy columns still linger
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'workflow_approvals' AND column_name = 'created_at'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'workflow_approvals' AND column_name = 'requested_at'
    ) THEN
      ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS created_at;
      ALTER TABLE workflow_approvals DROP COLUMN IF EXISTS updated_at;
      DROP TRIGGER IF EXISTS workflow_approvals_updated_at ON workflow_approvals;
    END IF;
  END IF;
END $$;

-- Drop legacy index, rebuild canonical index
DROP INDEX IF EXISTS idx_workflow_approvals_run;
DROP INDEX IF EXISTS workflow_approvals_run_status_idx;
CREATE INDEX IF NOT EXISTS workflow_approvals_run_status_idx
  ON workflow_approvals (run_id, status, requested_at DESC);

--------------------------------------------------------------------------------
-- 4. workflow_handoffs
--    Legacy columns: source_run_id, target_phase, target_run_id
--    Canonical columns: from_phase, to_phase, target_artifact_id
--    Legacy constraints: workflow_handoffs_target_phase_check, workflow_handoffs_status_check,
--                        workflow_handoffs_source_run_id_fkey, workflow_handoffs_target_run_id_fkey
--    Legacy indexes: idx_workflow_handoffs_project_phase
--------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_handoffs' AND column_name = 'from_phase'
  ) THEN
    -- Add canonical columns
    ALTER TABLE workflow_handoffs ADD COLUMN from_phase TEXT;
    ALTER TABLE workflow_handoffs ADD COLUMN to_phase TEXT;
    ALTER TABLE workflow_handoffs ADD COLUMN target_artifact_id TEXT;

    -- Backfill from legacy columns + joined data
    UPDATE workflow_handoffs h
    SET from_phase = COALESCE(
          h.payload->>'fromPhase',
          (SELECT r.phase FROM workflow_runs r WHERE r.run_id = h.source_run_id),
          'unknown'
        ),
        to_phase = COALESCE(h.target_phase, 'unknown'),
        target_artifact_id = h.payload->>'targetArtifactId';

    -- Make NOT NULL where required
    ALTER TABLE workflow_handoffs ALTER COLUMN from_phase SET NOT NULL;
    ALTER TABLE workflow_handoffs ALTER COLUMN to_phase SET NOT NULL;

    -- Drop legacy check constraints
    ALTER TABLE workflow_handoffs DROP CONSTRAINT IF EXISTS workflow_handoffs_target_phase_check;
    ALTER TABLE workflow_handoffs DROP CONSTRAINT IF EXISTS workflow_handoffs_status_check;

    -- Drop legacy foreign keys before dropping the columns
    ALTER TABLE workflow_handoffs DROP CONSTRAINT IF EXISTS workflow_handoffs_source_run_id_fkey;
    ALTER TABLE workflow_handoffs DROP CONSTRAINT IF EXISTS workflow_handoffs_target_run_id_fkey;

    -- Drop legacy columns
    ALTER TABLE workflow_handoffs DROP COLUMN IF EXISTS source_run_id;
    ALTER TABLE workflow_handoffs DROP COLUMN IF EXISTS target_phase;
    ALTER TABLE workflow_handoffs DROP COLUMN IF EXISTS target_run_id;
  ELSE
    -- Already canonical; clean up any leftover legacy constraints and columns
    ALTER TABLE workflow_handoffs DROP CONSTRAINT IF EXISTS workflow_handoffs_target_phase_check;
    ALTER TABLE workflow_handoffs DROP CONSTRAINT IF EXISTS workflow_handoffs_status_check;
    ALTER TABLE workflow_handoffs DROP CONSTRAINT IF EXISTS workflow_handoffs_source_run_id_fkey;
    ALTER TABLE workflow_handoffs DROP CONSTRAINT IF EXISTS workflow_handoffs_target_run_id_fkey;
    ALTER TABLE workflow_handoffs DROP COLUMN IF EXISTS source_run_id;
    ALTER TABLE workflow_handoffs DROP COLUMN IF EXISTS target_phase;
    ALTER TABLE workflow_handoffs DROP COLUMN IF EXISTS target_run_id;
  END IF;
END $$;

-- Drop legacy index, rebuild canonical index
DROP INDEX IF EXISTS idx_workflow_handoffs_project_phase;
DROP INDEX IF EXISTS workflow_handoffs_project_idx;
CREATE INDEX IF NOT EXISTS workflow_handoffs_project_idx
  ON workflow_handoffs (project_id, from_phase, to_phase, updated_at DESC);

--------------------------------------------------------------------------------
-- 5. workflow_notebook_bindings
--    Legacy columns: phase, cell_id, binding_key, revision, verified_at
--    Canonical columns: artifact_id, step_id, cell_ids, binding_revision
--    Legacy constraints: workflow_notebook_bindings_phase_check,
--                        workflow_notebook_bindings_cell_id_fkey,
--                        workflow_notebook_bindings_notebook_id_fkey (keep but relax NOT NULL)
--    Legacy indexes: idx_workflow_notebook_bindings_run
--    Also: notebook_id changes from NOT NULL to nullable
--------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_notebook_bindings' AND column_name = 'cell_ids'
  ) THEN
    -- Add canonical columns
    ALTER TABLE workflow_notebook_bindings ADD COLUMN artifact_id TEXT;
    ALTER TABLE workflow_notebook_bindings ADD COLUMN step_id TEXT;
    ALTER TABLE workflow_notebook_bindings ADD COLUMN cell_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE workflow_notebook_bindings ADD COLUMN binding_revision INTEGER NOT NULL DEFAULT 1;

    -- Backfill from legacy columns
    UPDATE workflow_notebook_bindings
    SET artifact_id = payload->>'artifactId',
        step_id = payload->>'stepId',
        cell_ids = CASE
          WHEN cell_id IS NOT NULL THEN jsonb_build_array(cell_id::text)
          ELSE '[]'::jsonb
        END,
        binding_revision = COALESCE(revision, 1);

    -- Drop legacy check constraints
    ALTER TABLE workflow_notebook_bindings DROP CONSTRAINT IF EXISTS workflow_notebook_bindings_phase_check;

    -- Drop legacy foreign key on cell_id before dropping the column
    ALTER TABLE workflow_notebook_bindings DROP CONSTRAINT IF EXISTS workflow_notebook_bindings_cell_id_fkey;

    -- Relax notebook_id from NOT NULL to nullable (canonical schema allows NULL)
    ALTER TABLE workflow_notebook_bindings ALTER COLUMN notebook_id DROP NOT NULL;

    -- Drop legacy columns
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS phase;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS cell_id;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS binding_key;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS revision;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS verified_at;
  ELSE
    -- Already canonical; clean up any leftover legacy constraints and columns
    ALTER TABLE workflow_notebook_bindings DROP CONSTRAINT IF EXISTS workflow_notebook_bindings_phase_check;
    ALTER TABLE workflow_notebook_bindings DROP CONSTRAINT IF EXISTS workflow_notebook_bindings_cell_id_fkey;
    ALTER TABLE workflow_notebook_bindings ALTER COLUMN notebook_id DROP NOT NULL;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS phase;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS cell_id;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS binding_key;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS revision;
    ALTER TABLE workflow_notebook_bindings DROP COLUMN IF EXISTS verified_at;
  END IF;
END $$;

-- Drop legacy index, rebuild canonical index
DROP INDEX IF EXISTS idx_workflow_notebook_bindings_run;
DROP INDEX IF EXISTS workflow_notebook_bindings_run_idx;
CREATE INDEX IF NOT EXISTS workflow_notebook_bindings_run_idx
  ON workflow_notebook_bindings (run_id, updated_at DESC);

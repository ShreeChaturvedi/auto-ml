-- 010_experiments.sql
-- Experiments phase: tuning studies table

DO $$ BEGIN

-- Tuning studies (tracking Optuna runs)
CREATE TABLE IF NOT EXISTS tuning_studies (
  study_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  source_model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  n_trials INTEGER NOT NULL,
  metric TEXT NOT NULL,
  best_trial_number INTEGER,
  best_value DOUBLE PRECISION,
  best_params JSONB,
  result_model_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tuning_studies_project_id_idx ON tuning_studies(project_id);
CREATE INDEX IF NOT EXISTS tuning_studies_source_model_idx ON tuning_studies(source_model_id);

END $$;

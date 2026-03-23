-- 014_models.sql
-- Migrate model storage from file-backed JSON to Postgres

CREATE TABLE IF NOT EXISTS models (
  model_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('classification', 'regression', 'clustering')),
  library TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  training_ms INTEGER,
  target_column TEXT,
  feature_columns JSONB,
  sample_count INTEGER,
  artifact JSONB,
  error TEXT,
  metadata JSONB,
  evaluation_status TEXT CHECK (evaluation_status IN ('pending', 'computing', 'ready', 'failed')),
  evaluation_computed_at TIMESTAMPTZ,
  evaluation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS models_project_id_idx ON models(project_id);
CREATE INDEX IF NOT EXISTS models_dataset_id_idx ON models(dataset_id);

-- Add FK constraints from tuning_studies to models (use DO block for idempotency)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tuning_studies_source_model_fk' AND table_name = 'tuning_studies'
  ) THEN
    ALTER TABLE tuning_studies
      ADD CONSTRAINT tuning_studies_source_model_fk
      FOREIGN KEY (source_model_id) REFERENCES models(model_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tuning_studies_result_model_fk' AND table_name = 'tuning_studies'
  ) THEN
    ALTER TABLE tuning_studies
      ADD CONSTRAINT tuning_studies_result_model_fk
      FOREIGN KEY (result_model_id) REFERENCES models(model_id) ON DELETE SET NULL;
  END IF;
END $$;

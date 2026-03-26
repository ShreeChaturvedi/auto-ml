CREATE TABLE IF NOT EXISTS nl_placeholder_suggestions (
  suggestion_set_id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(project_id) ON DELETE CASCADE,
  schema_fingerprint TEXT NOT NULL,
  model_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  suggestions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nl_placeholder_suggestions_lookup
  ON nl_placeholder_suggestions(project_id, schema_fingerprint, model_id, prompt_version);

ALTER TABLE nl_placeholder_suggestions
  ADD COLUMN IF NOT EXISTS workflow_placeholders JSONB;

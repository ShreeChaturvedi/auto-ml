CREATE TABLE IF NOT EXISTS savepoints (
  savepoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES notebooks(notebook_id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  turn_message_id TEXT NOT NULL,
  cells_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_savepoints_notebook_turn
  ON savepoints (notebook_id, turn_index ASC);

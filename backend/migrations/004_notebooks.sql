-- Migration: Notebooks and Cells for LLM-managed notebook system
-- Part of AI-Augmented AutoML Toolchain

-- Notebooks table (one per project for now, UNIQUE constraint)
CREATE TABLE IF NOT EXISTS notebooks (
  notebook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Notebook',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

-- Cells table with position ordering, locking, and output storage
CREATE TABLE IF NOT EXISTS cells (
  cell_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID REFERENCES notebooks(notebook_id) ON DELETE CASCADE,
  cell_type TEXT NOT NULL DEFAULT 'code' CHECK (cell_type IN ('code', 'markdown')),
  title TEXT,
  content TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  execution_count INTEGER DEFAULT 0,
  execution_status TEXT DEFAULT 'idle' CHECK (execution_status IN ('idle', 'running', 'success', 'error')),
  execution_duration_ms INTEGER,
  output JSONB DEFAULT '[]'::jsonb,
  output_refs JSONB DEFAULT '[]'::jsonb,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Large outputs stored separately (images, HTML, large tables)
CREATE TABLE IF NOT EXISTS cell_outputs (
  output_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id UUID REFERENCES cells(cell_id) ON DELETE CASCADE,
  output_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  byte_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_notebooks_project ON notebooks(project_id);
CREATE INDEX IF NOT EXISTS idx_cells_notebook ON cells(notebook_id);
CREATE INDEX IF NOT EXISTS idx_cells_position ON cells(notebook_id, position);
CREATE INDEX IF NOT EXISTS idx_cells_locked ON cells(locked_by) WHERE locked_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cell_outputs_cell ON cell_outputs(cell_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notebook_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating timestamps
DROP TRIGGER IF EXISTS notebooks_updated_at ON notebooks;
CREATE TRIGGER notebooks_updated_at
  BEFORE UPDATE ON notebooks
  FOR EACH ROW
  EXECUTE FUNCTION update_notebook_timestamp();

DROP TRIGGER IF EXISTS cells_updated_at ON cells;
CREATE TRIGGER cells_updated_at
  BEFORE UPDATE ON cells
  FOR EACH ROW
  EXECUTE FUNCTION update_notebook_timestamp();

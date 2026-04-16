-- Add a `kind` column to notebooks to distinguish phase-bound notebooks
-- (preprocessing, feature-engineering, training) from standalone notebooks
-- created in the data viewer phase for ad-hoc exploration.
--
-- Default 'phase' preserves backward compatibility: every existing notebook
-- is owned by a phase workflow and keeps its current behavior. Standalone
-- notebooks must be created with kind='standalone' explicitly.

ALTER TABLE notebooks
  ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'phase'
  CHECK (kind IN ('phase', 'standalone'));

CREATE INDEX IF NOT EXISTS idx_notebooks_project_kind
  ON notebooks (project_id, kind);

-- Migration: add canonical metadata field to notebook cells
-- Supports preprocessing step/cell lineage bindings.

ALTER TABLE cells
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

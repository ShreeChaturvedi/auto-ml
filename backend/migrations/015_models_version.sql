-- 015_models_version.sql
-- Add version column to models table for model versioning

ALTER TABLE models ADD COLUMN IF NOT EXISTS version INTEGER;

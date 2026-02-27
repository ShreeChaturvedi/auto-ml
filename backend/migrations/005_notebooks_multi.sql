-- Migration: Allow multiple notebooks per project
-- Removes the single-notebook unique constraint introduced in 004_notebooks.sql

ALTER TABLE notebooks
  DROP CONSTRAINT IF EXISTS notebooks_project_id_key;

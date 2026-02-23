-- Add icon and color columns to projects table

ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'Folder';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'blue';

-- Migration 012: Backfill project ownership
-- Assigns unowned projects to the first registered user (idempotent)
UPDATE projects
SET user_id = (SELECT user_id FROM users ORDER BY created_at ASC LIMIT 1)
WHERE user_id IS NULL
  AND EXISTS (SELECT 1 FROM users);

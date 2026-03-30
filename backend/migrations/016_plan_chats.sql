-- Plan chats: server-persisted onboarding plan conversations
CREATE TABLE IF NOT EXISTS plan_chats (
  chat_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress', 'completed')),
  messages          JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer_history    JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_round     INTEGER NOT NULL DEFAULT 0,
  completed_plan_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_chats_project_user
  ON plan_chats (project_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_chats_in_progress
  ON plan_chats (project_id, status) WHERE status = 'in_progress';

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, setting_key)
);

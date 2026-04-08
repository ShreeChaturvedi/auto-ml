-- Migration 019: Email Verification Tokens
-- Mirrors password_reset_tokens from 002_auth.sql for email verification flow

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used       BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_evtokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_evtokens_hash ON email_verification_tokens(token_hash);

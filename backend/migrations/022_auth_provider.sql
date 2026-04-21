-- Migration 022: auth_provider column for cross-provider account protection
--
-- Tracks which authentication method originally created a user row. This is
-- the primary defense against the OAuth silent-account-merge vulnerability
-- (issue #344): a sign-in attempt via a provider that doesn't match the row's
-- `auth_provider` is rejected at 409 (OAuth side) or 401 (password side)
-- instead of silently handing back a JWT pair.
--
-- Default 'password' is correct for every existing row — users who registered
-- before this migration signed up via `/auth/register` with an email+password.
-- Google-OAuth-created rows are marked 'google' at insert time by the
-- oauthHandler. See backend/src/routes/auth/oauthHandler.ts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password'
  CHECK (auth_provider IN ('password', 'google'));

CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);

-- Migration 020: Backfill existing users as email-verified
-- Users who registered before the email verification flow was added
-- should not be forced through verification retroactively.

UPDATE users SET email_verified = true WHERE email_verified = false;

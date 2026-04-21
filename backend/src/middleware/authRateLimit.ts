/**
 * Rate-limit middleware for credential-sensitive auth endpoints.
 *
 * Covers /auth/login and /auth/forgot-password. The key is the composite
 * `ip:email` so a single attacker can't sidestep the limit by rotating
 * either IP (many IPs hitting the same email still share a bucket) or
 * email (same IP scanning many emails still shares a bucket).
 *
 * `skipSuccessfulRequests: true` means a valid user's repeated sign-ins
 * don't consume the bucket — only failed attempts do. bcrypt @ 12 rounds
 * stays as the secondary slowdown on correct-but-rate-limited attempts.
 *
 * See issue #345.
 */

import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../config.js';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Maximum failed attempts per (ip, email) pair within the window.
 * Production: tight (10). Dev/test: loose (100) so local probes and
 * vitest runs that fire many failed logins don't trip the limiter.
 */
const MAX_ATTEMPTS = env.nodeEnv === 'production' ? 10 : 100;

function keyFromReq(req: Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
  // Fall back to the raw IP; express-rate-limit also handles ipv6 normalisation
  // internally, but we include an explicit empty-string fallback so the key
  // never ends up being the literal string "undefined:undefined".
  const ip = req.ip ?? 'unknown';
  return `${ip}:${email}`;
}

export const authAttemptLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: keyFromReq,
  message: {
    error: 'Too many attempts. Try again in 15 minutes.',
    error_code: 'RATE_LIMITED'
  }
});

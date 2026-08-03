import type { Request, Response, NextFunction } from 'express';

/**
 * Per-IP and per-email rate limiting for POST /auth/login.
 *
 * Defaults (override via env):
 *   AUTH_LOGIN_IP_WINDOW_MS=900000   (15 min)
 *   AUTH_LOGIN_IP_MAX=30
 *   AUTH_LOGIN_EMAIL_WINDOW_MS=900000
 *   AUTH_LOGIN_EMAIL_MAX=10
 *   AUTH_LOGIN_LOCKOUT_FAILURES=8
 *   AUTH_LOGIN_LOCKOUT_MS=900000
 *
 * On limit: 429 { error: 'Too many login attempts. Try again later.' }
 */

interface Bucket {
  count: number;
  resetAt: number;
}

interface FailureBucket {
  failures: number;
  lockedUntil: number;
}

const ipBuckets = new Map<string, Bucket>();
const emailBuckets = new Map<string, Bucket>();
const lockouts = new Map<string, FailureBucket>();

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function touchBucket(map: Map<string, Bucket>, key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  existing.count += 1;
  return existing.count <= max;
}

export function resetLoginRateLimitStateForTests(): void {
  ipBuckets.clear();
  emailBuckets.clear();
  lockouts.clear();
}

export function recordLoginFailure(email: string, ip: string): void {
  const maxFailures = envInt('AUTH_LOGIN_LOCKOUT_FAILURES', 8);
  const lockoutMs = envInt('AUTH_LOGIN_LOCKOUT_MS', 15 * 60 * 1000);
  const key = `${email.toLowerCase()}|${ip}`;
  const now = Date.now();
  const bucket = lockouts.get(key) ?? { failures: 0, lockedUntil: 0 };
  if (bucket.lockedUntil > now) return;
  bucket.failures += 1;
  if (bucket.failures >= maxFailures) {
    bucket.lockedUntil = now + lockoutMs;
    bucket.failures = 0;
  }
  lockouts.set(key, bucket);
}

export function clearLoginFailures(email: string, ip: string): void {
  lockouts.delete(`${email.toLowerCase()}|${ip}`);
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = (req.ip || req.socket?.remoteAddress || 'unknown').toString();
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  const ipWindow = envInt('AUTH_LOGIN_IP_WINDOW_MS', 15 * 60 * 1000);
  const ipMax = envInt('AUTH_LOGIN_IP_MAX', 30);
  const emailWindow = envInt('AUTH_LOGIN_EMAIL_WINDOW_MS', 15 * 60 * 1000);
  const emailMax = envInt('AUTH_LOGIN_EMAIL_MAX', 10);

  const lockKey = `${email}|${ip}`;
  const lock = lockouts.get(lockKey);
  if (lock && lock.lockedUntil > Date.now()) {
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }

  if (!touchBucket(ipBuckets, `ip:${ip}`, ipWindow, ipMax)) {
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }

  if (email && !touchBucket(emailBuckets, `email:${email}`, emailWindow, emailMax)) {
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }

  next();
}

/**
 * Authentication middleware for protecting routes
 *
 * Provides two middleware functions:
 * - requireAuth: Blocks unauthenticated requests (returns 401)
 * - optionalAuth: Attaches user if authenticated, continues if not
 */

import { createHash } from 'node:crypto';

import type { Response, NextFunction } from 'express';

import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { UserRepository } from '../repositories/userRepository.js';
import { authService } from '../services/authService.js';
import type { AuthRequest } from '../types/auth.js';
import type { SafeUser } from '../types/user.js';

function getUserRepository() {
  return new UserRepository(getDbPool());
}

const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX_SIZE = 500;
const userCache = new Map<string, { user: SafeUser; expiry: number }>();
let benchmarkPasswordHashPromise: Promise<string> | undefined;

function evictExpiredUsers() {
  const now = Date.now();
  for (const [key, entry] of userCache) {
    if (entry.expiry <= now) userCache.delete(key);
  }
}

function cacheUser(userId: string, user: SafeUser) {
  if (userCache.size >= USER_CACHE_MAX_SIZE) evictExpiredUsers();
  userCache.set(userId, { user, expiry: Date.now() + USER_CACHE_TTL_MS });
}

function getCachedUser(userId: string): SafeUser | undefined {
  const cached = userCache.get(userId);
  if (cached && cached.expiry > Date.now()) return cached.user;
  if (cached) userCache.delete(userId);
  return undefined;
}

function passesEmailGate(user: SafeUser): boolean {
  return user.email_verified || env.devBypassEmailVerification;
}

function toDeterministicBenchmarkUserId(rawUserId: string): string {
  const trimmed = rawUserId.trim();
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidLike.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const hash = createHash('sha256').update(`benchmark-user:${trimmed}`).digest('hex');
  const variantNibble = ((parseInt(hash[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `${variantNibble}${hash.slice(17, 20)}`,
    hash.slice(20, 32)
  ].join('-');
}

function resolveBenchmarkBypassUser(req: AuthRequest): SafeUser | undefined {
  if (!env.benchmarkAuthBypass) {
    return undefined;
  }

  const userIdHeader = req.headers['x-benchmark-user-id'];
  const emailHeader = req.headers['x-benchmark-user-email'];
  const nameHeader = req.headers['x-benchmark-user-name'];
  const roleHeader = req.headers['x-benchmark-user-role'];

  const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return undefined;
  }

  const email = Array.isArray(emailHeader) ? emailHeader[0] : emailHeader;
  const name = Array.isArray(nameHeader) ? nameHeader[0] : nameHeader;
  const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;
  const timestamp = new Date(0);
  const rawUserId = userId.trim();

  return {
    user_id: toDeterministicBenchmarkUserId(rawUserId),
    email: typeof email === 'string' && email.trim() ? email.trim() : `${rawUserId}@benchmark.local`,
    name: typeof name === 'string' && name.trim() ? name.trim() : 'Benchmark User',
    role: role === 'admin' ? 'admin' : 'user',
    email_verified: true,
    auth_provider: 'password',
    created_at: timestamp,
    updated_at: timestamp,
    last_login_at: null
  };
}

async function ensureBenchmarkBypassUser(user: SafeUser): Promise<SafeUser> {
  if (!hasDatabaseConfiguration()) {
    return user;
  }

  benchmarkPasswordHashPromise ??= authService.hashPassword('benchmark-bypass-user');
  const passwordHash = await benchmarkPasswordHashPromise;
  const result = await getDbPool().query(
    `INSERT INTO users (
      user_id, email, password_hash, name, role, email_verified, auth_provider, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, true, 'password', NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          email_verified = true,
          auth_provider = 'password',
          updated_at = NOW()
    RETURNING user_id, email, name, role, email_verified, auth_provider, created_at, updated_at, last_login_at`,
    [user.user_id, user.email.toLowerCase(), passwordHash, user.name, user.role]
  );

  return result.rows[0] ?? user;
}

/**
 * Invalidate the in-memory user cache for a specific user.
 * Call after updating email_verified so the next requireAuth picks up fresh state.
 */
export function invalidateUserCache(userId: string): void {
  userCache.delete(userId);
}

/** Shared auth middleware factory. When `requireVerified` is true, unverified users get a 403. */
function createAuthMiddleware(opts: { requireVerified: boolean }) {
  return async function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const benchmarkUser = resolveBenchmarkBypassUser(req);
    if (benchmarkUser) {
      req.user = await ensureBenchmarkBypassUser(benchmarkUser);
      next();
      return;
    }

    if (!hasDatabaseConfiguration()) {
      res.status(503).json({ error: 'Authentication is not configured' });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const payload = authService.verifyAccessToken(authHeader.substring(7));
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    let user = getCachedUser(payload.userId);
    if (!user) {
      const dbUser = await getUserRepository().findById(payload.userId);
      if (!dbUser) {
        res.status(401).json({ error: 'User not found' });
        return;
      }
      user = dbUser;
      cacheUser(payload.userId, user);
    }

    if (opts.requireVerified && !passesEmailGate(user)) {
      res.status(403).json({ error: 'Email not verified' });
      return;
    }

    req.user = user;
    next();
  };
}

export const requireAuth = createAuthMiddleware({ requireVerified: true });
export const requireAuthAllowUnverified = createAuthMiddleware({ requireVerified: false });

/**
 * Optional authentication middleware
 * Attaches user to request if valid token is present, continues either way
 * Does not block requests without authentication
 *
 * Usage: app.use('/api/public-or-auth', optionalAuth)
 */
export async function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const benchmarkUser = resolveBenchmarkBypassUser(req);
  if (benchmarkUser) {
    req.user = await ensureBenchmarkBypassUser(benchmarkUser);
    next();
    return;
  }

  if (!hasDatabaseConfiguration()) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = authService.verifyAccessToken(token);

    if (payload) {
      const cachedUser = getCachedUser(payload.userId);
      if (cachedUser && passesEmailGate(cachedUser)) {
        req.user = cachedUser;
      } else if (!cachedUser) {
        const userRepository = getUserRepository();
        const user = await userRepository.findById(payload.userId);
        if (user && passesEmailGate(user)) {
          cacheUser(payload.userId, user);
          req.user = user;
        }
      }
    }
  }

  next();
}

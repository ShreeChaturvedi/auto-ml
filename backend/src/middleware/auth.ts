/**
 * Authentication middleware for protecting routes
 *
 * Provides two middleware functions:
 * - requireAuth: Blocks unauthenticated requests (returns 401)
 * - optionalAuth: Attaches user if authenticated, continues if not
 */

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

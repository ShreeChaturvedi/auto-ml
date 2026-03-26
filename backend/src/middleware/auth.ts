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
 * Require authentication middleware
 * Extracts JWT from Authorization header, verifies it, and attaches user to request
 * Returns 401 if token is missing, invalid, or user not found
 *
 * Usage: app.use('/api/protected', requireAuth)
 */
export async function requireAuth(
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

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const payload = authService.verifyAccessToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const cachedUser = getCachedUser(payload.userId);
  if (cachedUser) {
    if (!passesEmailGate(cachedUser)) {
      res.status(403).json({ error: 'Email not verified' });
      return;
    }
    req.user = cachedUser;
    next();
    return;
  }

  const userRepository = getUserRepository();
  const user = await userRepository.findById(payload.userId);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  if (!passesEmailGate(user)) {
    res.status(403).json({ error: 'Email not verified' });
    return;
  }

  cacheUser(payload.userId, user);

  // Attach user to request for use in route handlers
  req.user = user;
  next();
}

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

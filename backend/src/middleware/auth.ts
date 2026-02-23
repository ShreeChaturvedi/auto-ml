/**
 * Authentication middleware for protecting routes
 *
 * Provides two middleware functions:
 * - requireAuth: Blocks unauthenticated requests (returns 401)
 * - optionalAuth: Attaches user if authenticated, continues if not
 */

import type { Response, NextFunction } from 'express';

import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import { UserRepository } from '../repositories/userRepository.js';
import { authService } from '../services/authService.js';
import type { AuthRequest } from '../types/auth.js';

function getUserRepository() {
  return new UserRepository(getDbPool());
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

  // Load user from database to ensure they still exist
  const userRepository = getUserRepository();
  const user = await userRepository.findById(payload.userId);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

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
      const userRepository = getUserRepository();
      const user = await userRepository.findById(payload.userId);
      if (user) {
        req.user = user;
      }
    }
  }

  next();
}

/**
 * Authentication type definitions for JWT tokens and authenticated requests
 */

import type { Request } from 'express';

import type { SafeUser } from './user.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

// Extended Express Request type with optional user (for optionalAuth middleware)
export interface AuthRequest extends Request {
  user?: SafeUser;
}

// Request type for routes behind requireAuth — user is always present
export interface AuthenticatedRequest extends Request {
  user: SafeUser;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

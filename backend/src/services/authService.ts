/**
 * AuthService - Handles password hashing, JWT token generation and verification
 *
 * Features:
 * - Bcrypt password hashing with configurable rounds
 * - JWT access token generation with short expiry (15m default)
 * - Cryptographically secure refresh token generation
 * - Token verification and payload extraction
 * - Password reset token generation
 */

import crypto from 'crypto';

import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '../config.js';
import type { TokenPayload, AuthTokens } from '../types/auth.js';
import type { SafeUser } from '../types/user.js';

const REMEMBER_ME_DURATION = '30d';

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
};

/** Parse a duration string (e.g. '7d', '24h', '15m', '30s') into milliseconds. */
export function parseDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Invalid duration format: "${duration}"`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

export class AuthService {
  /**
   * Hash a plaintext password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, env.bcryptRounds);
  }

  /**
   * Verify a plaintext password against a bcrypt hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT access token for a user
   * Token contains user ID, email, and role
   */
  generateAccessToken(user: SafeUser): string {
    const payload: TokenPayload = {
      userId: user.user_id,
      email: user.email,
      role: user.role
    };
    return jwt.sign(payload, env.jwtSecret, {
      expiresIn: env.jwtAccessExpiresIn
    } as SignOptions);
  }

  /**
   * Generate a cryptographically secure refresh token
   * Returns 128-character hex string
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate both access and refresh tokens for a user
   */
  generateTokens(user: SafeUser): AuthTokens {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken()
    };
  }

  /**
   * Verify and decode a JWT access token
   * Returns token payload if valid, null if invalid or expired
   */
  verifyAccessToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, env.jwtSecret) as TokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Hash a refresh token or password reset token using SHA-256
   * Used for storing tokens securely in the database
   */
  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Generate a 64-character hex token for one-time-use flows (password reset, email verification). */
  generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /** @deprecated Use generateSecureToken(). Kept for existing call-sites. */
  generatePasswordResetToken(): string {
    return this.generateSecureToken();
  }

  /**
   * Get the refresh token expiry duration in milliseconds.
   * When rememberMe is true, uses 30-day duration; otherwise uses configured default.
   */
  refreshTokenExpiryMs(rememberMe?: boolean): number {
    return parseDuration(rememberMe ? REMEMBER_ME_DURATION : env.jwtRefreshExpiresIn);
  }
}

// Singleton instance
export const authService = new AuthService();

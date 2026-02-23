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

  /**
   * Generate a password reset token
   * Returns 64-character hex string
   */
  generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

// Singleton instance
export const authService = new AuthService();

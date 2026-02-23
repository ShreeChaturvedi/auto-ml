/**
 * UserRepository - Database operations for users and authentication tokens
 *
 * Features:
 * - User CRUD operations
 * - Refresh token management
 * - Password reset token management
 * - Safe user type conversion (strips password_hash)
 */

import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type { User, SafeUser, CreateUserInput, UpdateUserInput } from '../types/user.js';

export class UserRepository {
  constructor(private pool: Pool) {}

  /**
   * Convert User (with password_hash) to SafeUser (without password_hash)
   * Used for API responses to never expose password hashes
   */
  toSafeUser(user: User): SafeUser {
    const { ...safe } = user;
    return safe as SafeUser;
  }

  /**
   * Find a user by email address
   * Returns user with password_hash for authentication
   * Email is case-insensitive
   */
  async findByEmail(email: string): Promise<(User & { password_hash: string }) | null> {
    const result = await this.pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  }

  /**
   * Find a user by ID
   * Returns SafeUser without password_hash
   */
  async findById(userId: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT user_id, email, name, role, email_verified, created_at, updated_at, last_login_at FROM users WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new user
   * Email is automatically lowercased for consistency
   * Returns SafeUser without password_hash
   */
  async create(input: CreateUserInput & { password_hash: string }): Promise<SafeUser> {
    const userId = randomUUID();
    const result = await this.pool.query(
      `INSERT INTO users (user_id, email, password_hash, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING user_id, email, name, role, email_verified, created_at, updated_at, last_login_at`,
      [userId, input.email.toLowerCase(), input.password_hash, input.name, 'user']
    );
    return result.rows[0];
  }

  /**
   * Update user information
   * Can update email, name, and/or password_hash
   * Returns updated SafeUser, or null if user not found
   */
  async update(userId: string, input: UpdateUserInput & { password_hash?: string }): Promise<SafeUser | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (input.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(input.email.toLowerCase());
    }
    if (input.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(input.name);
    }
    if (input.password_hash !== undefined) {
      fields.push(`password_hash = $${paramCount++}`);
      values.push(input.password_hash);
    }

    if (fields.length === 0) return this.findById(userId);

    fields.push(`updated_at = NOW()`);
    values.push(userId);

    const result = await this.pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE user_id = $${paramCount}
       RETURNING user_id, email, name, role, email_verified, created_at, updated_at, last_login_at`,
      values
    );

    return result.rows[0] || null;
  }

  /**
   * Update user's last login timestamp
   * Called after successful login
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE user_id = $1',
      [userId]
    );
  }

  /**
   * Store a refresh token in the database
   * Token is hashed (SHA-256) before storage for security
   */
  async storeRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, tokenHash, expiresAt, ip, userAgent]
    );
  }

  /**
   * Find a refresh token by its hash
   * Returns token metadata including revocation status and expiry
   */
  async findRefreshToken(tokenHash: string): Promise<{ user_id: string; revoked: boolean; expires_at: Date } | null> {
    const result = await this.pool.query(
      'SELECT user_id, revoked, expires_at FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash]
    );
    return result.rows[0] || null;
  }

  /**
   * Revoke a single refresh token
   * Used during logout
   */
  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
      [tokenHash]
    );
  }

  /**
   * Revoke all refresh tokens for a user
   * Used after password change or security incidents
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
      [userId]
    );
  }

  /**
   * Store a password reset token in the database
   * Token is hashed (SHA-256) before storage for security
   */
  async storePasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  }

  /**
   * Find a password reset token by its hash
   * Returns token metadata including used status and expiry
   */
  async findPasswordResetToken(tokenHash: string): Promise<{ user_id: string; used: boolean; expires_at: Date } | null> {
    const result = await this.pool.query(
      'SELECT user_id, used, expires_at FROM password_reset_tokens WHERE token_hash = $1',
      [tokenHash]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark a password reset token as used
   * Prevents token reuse after password has been reset
   */
  async markPasswordResetTokenUsed(tokenHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE password_reset_tokens SET used = true WHERE token_hash = $1',
      [tokenHash]
    );
  }
}

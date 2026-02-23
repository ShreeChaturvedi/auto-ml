/**
 * Authentication Routes
 *
 * Endpoints:
 * - POST /auth/register - Create new user account
 * - POST /auth/login - Authenticate and receive tokens
 * - POST /auth/logout - Revoke refresh token
 * - POST /auth/refresh - Get new access token using refresh token
 * - GET /auth/me - Get current user info
 * - POST /auth/forgot-password - Request password reset
 * - POST /auth/reset-password - Reset password with token
 * - PATCH /auth/profile - Update user profile
 * - GET /auth/google - Initiate Google OAuth flow
 * - POST /auth/google/callback - Complete Google OAuth flow
 */

import type { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { env } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { UserRepository } from '../repositories/userRepository.js';
import { authService } from '../services/authService.js';
import { emailService } from '../services/emailService.js';
import type { AuthRequest } from '../types/auth.js';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional()
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional()
});

const googleCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required')
});

export function registerAuthRoutes(router: Router, pool: Pool) {
  const userRepository = new UserRepository(pool);

  /**
   * POST /auth/register
   * Register a new user account
   */
  router.post('/auth/register', async (req, res) => {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    const { email, password, name } = result.data;

    // Check if user already exists
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const password_hash = await authService.hashPassword(password);
    const user = await userRepository.create({ email, password, name, password_hash });

    // Generate tokens
    const tokens = authService.generateTokens(user);
    const refreshTokenHash = authService.hashRefreshToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await userRepository.storeRefreshToken(
      user.user_id,
      refreshTokenHash,
      expiresAt,
      req.ip,
      req.get('user-agent')
    );

    console.log(`[auth] registered user ${user.email}`);
    return res.status(201).json({ user, ...tokens });
  });

  /**
   * POST /auth/login
   * Authenticate user and return tokens
   */
  router.post('/auth/login', async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    const { email, password, rememberMe } = result.data;

    // Find user by email
    const userWithHash = await userRepository.findByEmail(email);
    if (!userWithHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const validPassword = await authService.verifyPassword(password, userWithHash.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRepository.toSafeUser(userWithHash);

    // Update last login timestamp
    await userRepository.updateLastLogin(user.user_id);

    // Generate tokens
    const tokens = authService.generateTokens(user);
    const refreshTokenHash = authService.hashRefreshToken(tokens.refreshToken);

    // Remember me extends refresh token expiry to 30 days
    const expiresAt = new Date(
      Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000
    );

    await userRepository.storeRefreshToken(
      user.user_id,
      refreshTokenHash,
      expiresAt,
      req.ip,
      req.get('user-agent')
    );

    console.log(`[auth] login ${user.email}`);
    return res.json({ user, ...tokens });
  });

  /**
   * POST /auth/refresh
   * Get new access token using refresh token
   */
  router.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const tokenHash = authService.hashRefreshToken(refreshToken);
    const tokenRecord = await userRepository.findRefreshToken(tokenHash);

    // Validate token exists, not revoked, and not expired
    if (!tokenRecord || tokenRecord.revoked || new Date() > tokenRecord.expires_at) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await userRepository.findById(tokenRecord.user_id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new access token (refresh token remains the same)
    const accessToken = authService.generateAccessToken(user);

    return res.json({ accessToken });
  });

  /**
   * POST /auth/logout
   * Revoke refresh token
   * Requires authentication
   */
  router.post('/auth/logout', requireAuth, async (req: AuthRequest, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = authService.hashRefreshToken(refreshToken);
      await userRepository.revokeRefreshToken(tokenHash);
    }

    console.log(`[auth] logout ${req.user?.email}`);
    return res.status(204).send();
  });

  /**
   * GET /auth/me
   * Get current authenticated user
   * Requires authentication
   */
  router.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
    return res.json({ user: req.user });
  });

  /**
   * POST /auth/forgot-password
   * Request password reset email
   * Always returns success to prevent email enumeration
   */
  router.post('/auth/forgot-password', async (req, res) => {
    const result = forgotPasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    const { email } = result.data;
    const user = await userRepository.findByEmail(email);

    // Always return success message to prevent email enumeration attacks
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent' });
    }

    // Generate reset token
    const resetToken = authService.generatePasswordResetToken();
    const tokenHash = authService.hashRefreshToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    await userRepository.storePasswordResetToken(user.user_id, tokenHash, expiresAt);
    await emailService.sendPasswordResetEmail(email, resetToken);

    console.log(`[auth] password reset requested for ${email}`);
    return res.json({ message: 'If that email exists, a reset link has been sent' });
  });

  /**
   * POST /auth/reset-password
   * Reset password using token from email
   */
  router.post('/auth/reset-password', async (req, res) => {
    const result = resetPasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    const { token, password } = result.data;
    const tokenHash = authService.hashRefreshToken(token);
    const tokenRecord = await userRepository.findPasswordResetToken(tokenHash);

    // Validate token exists, not used, and not expired
    if (!tokenRecord || tokenRecord.used || new Date() > tokenRecord.expires_at) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Update password
    const password_hash = await authService.hashPassword(password);
    await userRepository.update(tokenRecord.user_id, { password_hash });

    // Mark token as used
    await userRepository.markPasswordResetTokenUsed(tokenHash);

    // Revoke all existing sessions for security
    await userRepository.revokeAllUserTokens(tokenRecord.user_id);

    console.log(`[auth] password reset completed for user ${tokenRecord.user_id}`);
    return res.json({ message: 'Password reset successful' });
  });

  /**
   * PATCH /auth/profile
   * Update user profile (name, email, password)
   * Requires authentication
   */
  router.patch('/auth/profile', requireAuth, async (req: AuthRequest, res) => {
    const result = updateProfileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    const userId = req.user!.user_id;
    const updates = result.data;

    // Handle password change
    if (updates.newPassword) {
      if (!updates.currentPassword) {
        return res.status(400).json({ error: 'Current password required' });
      }

      // Verify current password
      const userWithHash = await userRepository.findByEmail(req.user!.email);
      if (!userWithHash) {
        return res.status(404).json({ error: 'User not found' });
      }

      const validPassword = await authService.verifyPassword(
        updates.currentPassword,
        userWithHash.password_hash
      );
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Update password and revoke all sessions
      const password_hash = await authService.hashPassword(updates.newPassword);
      await userRepository.update(userId, { password_hash });
      await userRepository.revokeAllUserTokens(userId);
    }

    // Update name/email
    const updateData: { name?: string; email?: string } = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.email) updateData.email = updates.email;

    if (Object.keys(updateData).length > 0) {
      const updatedUser = await userRepository.update(userId, updateData);
      console.log(`[auth] profile updated for ${req.user!.email}`);
      return res.json({ user: updatedUser });
    }

    return res.json({ user: req.user });
  });

  /**
   * GET /auth/google
   * Initiate Google OAuth flow
   * Returns URL to redirect user to Google consent screen
   */
  router.get('/auth/google', async (_req, res) => {
    if (!env.googleClientId || !env.googleClientSecret) {
      return res.status(503).json({
        error: 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
      });
    }

    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: env.googleCallbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return res.json({ authUrl });
  });

  /**
   * POST /auth/google/callback
   * Complete Google OAuth flow
   * Exchanges authorization code for tokens and creates/logs in user
   */
  router.post('/auth/google/callback', async (req, res) => {
    const result = googleCallbackSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ errors: result.error.flatten() });
    }

    if (!env.googleClientId || !env.googleClientSecret) {
      return res.status(503).json({
        error: 'Google OAuth is not configured'
      });
    }

    const { code } = result.data;

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.googleClientId,
          client_secret: env.googleClientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: env.googleCallbackUrl
        })
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('[auth] Google token exchange failed:', error);
        return res.status(400).json({ error: 'Failed to exchange authorization code' });
      }

      const tokens = await tokenResponse.json() as { access_token: string; id_token: string };

      // Get user info from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });

      if (!userInfoResponse.ok) {
        return res.status(400).json({ error: 'Failed to get user info from Google' });
      }

      const googleUser = await userInfoResponse.json() as {
        id: string;
        email: string;
        name: string;
        picture?: string;
        verified_email?: boolean;
      };

      // Check if user exists by email
      let user = await userRepository.findByEmail(googleUser.email);

      if (user) {
        // User exists, update last login
        await userRepository.updateLastLogin(user.user_id);
        user = userRepository.toSafeUser(user);
      } else {
        // Create new user (no password for OAuth users)
        const randomPassword = authService.generatePasswordResetToken();
        const password_hash = await authService.hashPassword(randomPassword);

        user = await userRepository.create({
          email: googleUser.email,
          name: googleUser.name,
          password: randomPassword,
          password_hash
        });

        // Mark email as verified for Google OAuth users
        await userRepository.update(user.user_id, { email_verified: true });
      }

      // Generate tokens
      const jwtTokens = authService.generateTokens(user);
      const refreshTokenHash = authService.hashRefreshToken(jwtTokens.refreshToken);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days for OAuth

      await userRepository.storeRefreshToken(
        user.user_id,
        refreshTokenHash,
        expiresAt,
        req.ip,
        req.get('user-agent')
      );

      console.log(`[auth] Google OAuth login for ${googleUser.email}`);
      return res.json({ user, ...jwtTokens });

    } catch (error) {
      console.error('[auth] Google OAuth error:', error);
      return res.status(500).json({ error: 'Google authentication failed' });
    }
  });
}

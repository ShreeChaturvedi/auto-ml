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

import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { UserRepository } from '../repositories/userRepository.js';
import { authService } from '../services/authService.js';
import { emailService } from '../services/emailService.js';
import type { AuthenticatedRequest } from '../types/auth.js';

import { handleGoogleAuth, handleGoogleCallback } from './auth/oauthHandler.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAuthRoutes(router: Router, pool: Pool) {
  const userRepository = new UserRepository(pool);

  // POST /auth/register
  router.post(
    '/auth/register',
    asyncHandler(async (req, res) => {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      const { email, password, name } = result.data;

      const existing = await userRepository.findByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const password_hash = await authService.hashPassword(password);
      const user = await userRepository.create({ email, password, name, password_hash });

      const tokens = authService.generateTokens(user);
      const refreshTokenHash = authService.hashRefreshToken(tokens.refreshToken);
      const expiresAt = new Date(Date.now() + authService.refreshTokenExpiryMs());

      await userRepository.storeRefreshToken(
        user.user_id,
        refreshTokenHash,
        expiresAt,
        req.ip,
        req.get('user-agent')
      );

      appLogger.info(`[auth] registered user ${user.email}`);
      return res.status(201).json({ user, ...tokens });
    })
  );

  // POST /auth/login
  router.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      const { email, password, rememberMe } = result.data;

      const userWithHash = await userRepository.findByEmail(email);
      if (!userWithHash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const validPassword = await authService.verifyPassword(password, userWithHash.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = userRepository.toSafeUser(userWithHash);
      await userRepository.updateLastLogin(user.user_id);

      const tokens = authService.generateTokens(user);
      const refreshTokenHash = authService.hashRefreshToken(tokens.refreshToken);
      const expiresAt = new Date(
        Date.now() + authService.refreshTokenExpiryMs(rememberMe)
      );

      await userRepository.storeRefreshToken(
        user.user_id,
        refreshTokenHash,
        expiresAt,
        req.ip,
        req.get('user-agent')
      );

      appLogger.info(`[auth] login ${user.email}`);
      return res.json({ user, ...tokens });
    })
  );

  // POST /auth/refresh
  router.post(
    '/auth/refresh',
    asyncHandler(async (req, res) => {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const tokenHash = authService.hashRefreshToken(refreshToken);
      const tokenRecord = await userRepository.findRefreshToken(tokenHash);

      if (!tokenRecord || tokenRecord.revoked || new Date() > tokenRecord.expires_at) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      const user = await userRepository.findById(tokenRecord.user_id);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const accessToken = authService.generateAccessToken(user);
      return res.json({ accessToken });
    })
  );

  // POST /auth/logout
  router.post(
    '/auth/logout',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const { refreshToken } = req.body;
      if (refreshToken) {
        const tokenHash = authService.hashRefreshToken(refreshToken);
        await userRepository.revokeRefreshToken(tokenHash);
      }

      appLogger.info(`[auth] logout ${req.user.email}`);
      return res.status(204).send();
    })
  );

  // GET /auth/me
  router.get(
    '/auth/me',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      return res.json({ user: req.user });
    })
  );

  // POST /auth/forgot-password
  router.post(
    '/auth/forgot-password',
    asyncHandler(async (req, res) => {
      const result = forgotPasswordSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      const { email } = result.data;
      const user = await userRepository.findByEmail(email);

      if (!user) {
        return res.json({ message: 'If that email exists, a reset link has been sent' });
      }

      const resetToken = authService.generatePasswordResetToken();
      const tokenHash = authService.hashRefreshToken(resetToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await userRepository.storePasswordResetToken(user.user_id, tokenHash, expiresAt);
      await emailService.sendPasswordResetEmail(email, resetToken);

      appLogger.info(`[auth] password reset requested for ${email}`);
      return res.json({ message: 'If that email exists, a reset link has been sent' });
    })
  );

  // POST /auth/reset-password
  router.post(
    '/auth/reset-password',
    asyncHandler(async (req, res) => {
      const result = resetPasswordSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      const { token, password } = result.data;
      const tokenHash = authService.hashRefreshToken(token);
      const tokenRecord = await userRepository.findPasswordResetToken(tokenHash);

      if (!tokenRecord || tokenRecord.used || new Date() > tokenRecord.expires_at) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const password_hash = await authService.hashPassword(password);
      await userRepository.update(tokenRecord.user_id, { password_hash });
      await userRepository.markPasswordResetTokenUsed(tokenHash);
      await userRepository.revokeAllUserTokens(tokenRecord.user_id);

      appLogger.info(`[auth] password reset completed for user ${tokenRecord.user_id}`);
      return res.json({ message: 'Password reset successful' });
    })
  );

  // PATCH /auth/profile
  router.patch(
    '/auth/profile',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const result = updateProfileSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      const userId = req.user.user_id;
      const updates = result.data;

      if (updates.newPassword) {
        if (!updates.currentPassword) {
          return res.status(400).json({ error: 'Current password required' });
        }

        const userWithHash = await userRepository.findByEmail(req.user.email);
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

        const password_hash = await authService.hashPassword(updates.newPassword);
        await userRepository.update(userId, { password_hash });
        await userRepository.revokeAllUserTokens(userId);
      }

      const updateData: { name?: string; email?: string } = {};
      if (updates.name) updateData.name = updates.name;
      if (updates.email) updateData.email = updates.email;

      if (Object.keys(updateData).length > 0) {
        const updatedUser = await userRepository.update(userId, updateData);
        appLogger.info(`[auth] profile updated for ${req.user.email}`);
        return res.json({ user: updatedUser });
      }

      return res.json({ user: req.user });
    })
  );

  // GET /auth/google — initiate OAuth flow
  router.get('/auth/google', asyncHandler(handleGoogleAuth));

  // POST /auth/google/callback — complete OAuth flow
  router.post(
    '/auth/google/callback',
    asyncHandler(async (req, res) => {
      const result = googleCallbackSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ errors: result.error.flatten() });
      }

      try {
        return await handleGoogleCallback(req, res, userRepository);
      } catch (error) {
        appLogger.error('[auth] Google OAuth error:', error);
        return res.status(500).json({ error: 'Google authentication failed' });
      }
    })
  );
}

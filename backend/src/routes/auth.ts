import type { Request, Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { appLogger } from '../logging/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth, requireAuthAllowUnverified, invalidateUserCache } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { UserRepository } from '../repositories/userRepository.js';
import { authService } from '../services/authService.js';
import { emailService } from '../services/emailService.js';
import type { AuthenticatedRequest } from '../types/auth.js';
import type { SafeUser } from '../types/user.js';
import { sendBadRequest, sendConflict, sendUnauthorized, sendNotFound } from '../utils/errors.js';

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

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required')
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

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address').optional()
});

const googleCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required')
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function registerAuthRoutes(router: Router, pool: Pool) {
  const userRepository = new UserRepository(pool);

  /** Generate tokens and persist the refresh token in one step. */
  async function issueAndStoreTokens(user: SafeUser, req: Request, rememberMe?: boolean) {
    const tokens = authService.generateTokens(user);
    const hash = authService.hashRefreshToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + authService.refreshTokenExpiryMs(rememberMe));
    await userRepository.storeRefreshToken(user.user_id, hash, expiresAt, req.ip, req.get('user-agent'));
    return tokens;
  }

  /** Generate a verification token, persist it, and send the verification email. */
  async function sendVerificationToken(userId: string, email: string) {
    const token = authService.generateSecureToken();
    const hash = authService.hashRefreshToken(token);
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await userRepository.storeEmailVerificationToken(userId, hash, expiresAt);
    await emailService.sendVerificationEmail(email, token);
  }

  // POST /auth/register
  router.post(
    '/auth/register',
    validateRequest(registerSchema),
    asyncHandler(async (req, res) => {
      const { email, password, name } = req.body;

      const existing = await userRepository.findByEmail(email);
      if (existing) {
        sendConflict(res, 'Email already registered');
        return;
      }

      const password_hash = await authService.hashPassword(password);
      const user = await userRepository.create({ email, password, name, password_hash });

      // Fire-and-forget: don't block registration on email delivery
      sendVerificationToken(user.user_id, user.email).catch((err) =>
        appLogger.error(`[auth] failed to send verification email to ${user.email}`, err)
      );

      const tokens = await issueAndStoreTokens(user, req);

      appLogger.info(`[auth] registered user ${user.email}`);
      return res.status(201).json({ user, ...tokens });
    })
  );

  // POST /auth/login
  router.post(
    '/auth/login',
    validateRequest(loginSchema),
    asyncHandler(async (req, res) => {
      const { email, password, rememberMe } = req.body;

      const userWithHash = await userRepository.findByEmail(email);
      if (!userWithHash) {
        sendUnauthorized(res, 'Invalid email or password');
        return;
      }

      const validPassword = await authService.verifyPassword(password, userWithHash.password_hash);
      if (!validPassword) {
        sendUnauthorized(res, 'Invalid email or password');
        return;
      }

      const user = userRepository.toSafeUser(userWithHash);
      await userRepository.updateLastLogin(user.user_id);
      const tokens = await issueAndStoreTokens(user, req, rememberMe);

      appLogger.info(`[auth] login ${user.email}`);
      return res.json({ user, ...tokens });
    })
  );

  // POST /auth/refresh
  router.post(
    '/auth/refresh',
    validateRequest(refreshSchema),
    asyncHandler(async (req, res) => {
      const { refreshToken } = req.body;
      const tokenHash = authService.hashRefreshToken(refreshToken);
      const tokenRecord = await userRepository.findRefreshToken(tokenHash);

      if (!tokenRecord || tokenRecord.revoked || new Date() > tokenRecord.expires_at) {
        sendUnauthorized(res, 'Invalid or expired refresh token');
        return;
      }

      const user = await userRepository.findById(tokenRecord.user_id);
      if (!user) {
        sendNotFound(res, 'User');
        return;
      }

      await userRepository.revokeRefreshToken(tokenHash);
      const tokens = await issueAndStoreTokens(user, req);

      appLogger.info(`[auth] rotated refresh token for ${user.email}`);
      return res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
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

  // POST /auth/revoke-all-sessions — revoke all sessions for the current user
  router.post(
    '/auth/revoke-all-sessions',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      await userRepository.revokeAllUserTokens(req.user.user_id);
      appLogger.info(`[auth] all sessions revoked for ${req.user.email}`);
      return res.json({ message: 'All sessions revoked' });
    })
  );

  // GET /auth/sessions — list active sessions for the current user
  router.get(
    '/auth/sessions',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const sessions = await userRepository.getActiveSessions(req.user.user_id);
      return res.json({ sessions });
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
    validateRequest(forgotPasswordSchema),
    asyncHandler(async (req, res) => {
      const { email } = req.body;
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
    validateRequest(resetPasswordSchema),
    asyncHandler(async (req, res) => {
      const { token, password } = req.body;
      const tokenHash = authService.hashRefreshToken(token);
      const tokenRecord = await userRepository.findPasswordResetToken(tokenHash);

      if (!tokenRecord || tokenRecord.used || new Date() > tokenRecord.expires_at) {
        sendBadRequest(res, 'Invalid or expired reset token');
        return;
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
    validateRequest(updateProfileSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const userId = req.user.user_id;
      const updates = req.body;

      if (updates.newPassword) {
        if (!updates.currentPassword) {
          sendBadRequest(res, 'Current password required');
          return;
        }

        const userWithHash = await userRepository.findByEmail(req.user.email);
        if (!userWithHash) {
          sendNotFound(res, 'User');
          return;
        }

        const validPassword = await authService.verifyPassword(
          updates.currentPassword,
          userWithHash.password_hash
        );
        if (!validPassword) {
          sendUnauthorized(res, 'Current password is incorrect');
          return;
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

  // POST /auth/verify-email — consume verification token from email link
  router.post(
    '/auth/verify-email',
    validateRequest(verifyEmailSchema),
    asyncHandler(async (req, res) => {
      const { token } = req.body;
      const tokenHash = authService.hashRefreshToken(token);
      const tokenRecord = await userRepository.findEmailVerificationToken(tokenHash);

      if (!tokenRecord || tokenRecord.used || new Date() > tokenRecord.expires_at) {
        sendBadRequest(res, 'Invalid or expired verification token');
        return;
      }

      await userRepository.markEmailVerificationTokenUsed(tokenHash);
      await userRepository.markEmailVerified(tokenRecord.user_id);
      invalidateUserCache(tokenRecord.user_id);

      appLogger.info(`[auth] email verified for user ${tokenRecord.user_id}`);
      return res.json({ message: 'Email verified successfully' });
    })
  );

  // POST /auth/resend-verification — resend verification email (rate-limited)
  router.post(
    '/auth/resend-verification',
    requireAuthAllowUnverified,
    validateRequest(resendVerificationSchema),
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const user = req.user;

      if (user.email_verified) {
        sendBadRequest(res, 'Email is already verified');
        return;
      }

      // Rate limit: 60s between resends
      const latest = await userRepository.findLatestEmailVerificationToken(user.user_id);
      if (latest) {
        const elapsed = Date.now() - new Date(latest.created_at).getTime();
        if (elapsed < 60_000) {
          const retryAfter = Math.ceil((60_000 - elapsed) / 1000);
          res.status(429).json({ error: 'Please wait before requesting another email', retryAfter });
          return;
        }
      }

      // Allow email correction
      let targetEmail = user.email;
      if (req.body.email && req.body.email !== user.email) {
        targetEmail = req.body.email;
        await userRepository.updateEmail(user.user_id, targetEmail);
        invalidateUserCache(user.user_id);
      }

      await sendVerificationToken(user.user_id, targetEmail);

      appLogger.info(`[auth] verification email resent to ${targetEmail}`);
      return res.json({ message: 'Verification email sent' });
    })
  );

  // GET /auth/verification-status — poll whether email has been verified
  router.get(
    '/auth/verification-status',
    requireAuthAllowUnverified,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      // Bypass cache — read fresh from DB
      const freshUser = await userRepository.findById(req.user.user_id);
      if (!freshUser) {
        sendNotFound(res, 'User');
        return;
      }
      return res.json({ emailVerified: freshUser.email_verified });
    })
  );

  // GET /auth/google — initiate OAuth flow
  router.get('/auth/google', asyncHandler(handleGoogleAuth));

  // POST /auth/google/callback — complete OAuth flow
  router.post(
    '/auth/google/callback',
    validateRequest(googleCallbackSchema),
    asyncHandler(async (req, res) => handleGoogleCallback(req, res, userRepository))
  );
}

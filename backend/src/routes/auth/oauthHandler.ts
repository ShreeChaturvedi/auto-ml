import type { Request, Response } from 'express';

import { env } from '../../config.js';
import { appLogger } from '../../logging/logger.js';
import type { UserRepository } from '../../repositories/userRepository.js';
import { authService } from '../../services/authService.js';
import type { SafeUser } from '../../types/user.js';

/**
 * GET /auth/google
 * Initiate Google OAuth flow — returns URL to redirect user to Google consent screen.
 */
export async function handleGoogleAuth(_req: Request, res: Response) {
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
}

/**
 * POST /auth/google/callback
 * Complete Google OAuth flow — exchanges authorization code for tokens and
 * creates or logs in user.
 */
export async function handleGoogleCallback(
  req: Request,
  res: Response,
  userRepository: UserRepository
) {
  if (!env.googleClientId || !env.googleClientSecret) {
    return res.status(503).json({
      error: 'Google OAuth is not configured'
    });
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      code: req.body.code as string,
      grant_type: 'authorization_code',
      redirect_uri: env.googleCallbackUrl
    })
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    appLogger.error('[auth] Google token exchange failed:', error);
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
  const existingUser = await userRepository.findByEmail(googleUser.email);
  let safeUser: SafeUser;

  if (existingUser) {
    // User exists, update last login
    await userRepository.updateLastLogin(existingUser.user_id);
    safeUser = userRepository.toSafeUser(existingUser);
  } else {
    // Create new user (no password for OAuth users)
    const randomPassword = authService.generatePasswordResetToken();
    const password_hash = await authService.hashPassword(randomPassword);

    const createdUser = await userRepository.create({
      email: googleUser.email,
      name: googleUser.name,
      password: randomPassword,
      password_hash
    });

    // Mark email as verified for Google OAuth users
    await userRepository.markEmailVerified(createdUser.user_id);

    const verifiedUser = await userRepository.findById(createdUser.user_id);
    if (!verifiedUser) {
      return res.status(500).json({ error: 'Failed to load newly created OAuth user' });
    }
    safeUser = verifiedUser;
  }

  // Generate tokens
  const jwtTokens = authService.generateTokens(safeUser);
  const refreshTokenHash = authService.hashRefreshToken(jwtTokens.refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days for OAuth

  await userRepository.storeRefreshToken(
    safeUser.user_id,
    refreshTokenHash,
    expiresAt,
    req.ip,
    req.get('user-agent')
  );

  appLogger.info(`[auth] Google OAuth login for ${googleUser.email}`);
  return res.json({ user: safeUser, ...jwtTokens });
}

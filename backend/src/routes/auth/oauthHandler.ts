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
  if (!env.googleAuthEnabled) {
    return res.status(503).json({
      error: 'Google sign-in is coming soon for the public beta.',
      error_code: 'GOOGLE_AUTH_DISABLED'
    });
  }

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
  if (!env.googleAuthEnabled) {
    return res.status(503).json({
      error: 'Google sign-in is coming soon for the public beta.',
      error_code: 'GOOGLE_AUTH_DISABLED'
    });
  }

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

  // Issue #344 guard 1 — refuse unverified email claims. Google only
  // guarantees verified_email=true for Gmail-owned addresses and properly-
  // verified Workspace accounts. Trusting an unverified email would let an
  // attacker with any Google account claiming the victim's email sign in as
  // the victim.
  if (googleUser.verified_email !== true) {
    appLogger.warn(`[auth] Google OAuth blocked: email not verified for ${googleUser.email}`);
    return res.status(400).json({
      error: 'Your Google account email is not verified. Verify it with Google, then try again.',
      error_code: 'GOOGLE_EMAIL_NOT_VERIFIED'
    });
  }

  // Check if user exists by email
  const existingUser = await userRepository.findByEmail(googleUser.email);
  let safeUser: SafeUser;

  if (existingUser) {
    // Issue #344 guard 2 — refuse cross-provider sign-in. A row created via
    // /auth/register (auth_provider='password') can't be claimed by Google
    // OAuth just because the emails match. The user must sign in with
    // password, then opt into an explicit link flow (future work).
    if (existingUser.auth_provider !== 'google') {
      appLogger.warn(`[auth] Google OAuth blocked: ${googleUser.email} belongs to a ${existingUser.auth_provider} account`);
      return res.status(409).json({
        error: 'An account with this email already exists. Sign in with your password instead.',
        error_code: 'ACCOUNT_PROVIDER_MISMATCH'
      });
    }

    // User exists AND signed up via Google — refresh last login.
    await userRepository.updateLastLogin(existingUser.user_id);
    safeUser = userRepository.toSafeUser(existingUser);
  } else {
    // Brand-new Google user. password_hash is NOT NULL in the schema so we
    // still insert an unguessable random-hash placeholder; auth_provider
    // ='google' is what downstream code (this handler + /auth/login) uses
    // to route. The placeholder can't be used to log in because /auth/login
    // rejects auth_provider !== 'password' before verifyPassword runs.
    const placeholderToken = authService.generatePasswordResetToken();
    const password_hash = await authService.hashPassword(placeholderToken);

    const createdUser = await userRepository.create({
      email: googleUser.email,
      name: googleUser.name,
      auth_provider: 'google',
      password_hash
    });

    // Google already confirmed the address via verified_email=true above.
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
  const expiresAt = new Date(Date.now() + authService.refreshTokenExpiryMs(true)); // OAuth gets rememberMe duration

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

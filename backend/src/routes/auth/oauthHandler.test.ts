import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../../types/user.js';

// --- Mocks ---------------------------------------------------------------

const configState = vi.hoisted(() => ({
  env: {
    googleAuthEnabled: true,
    googleClientId: 'test-client-id',
    googleClientSecret: 'test-client-secret',
    googleCallbackUrl: 'http://localhost:5173/auth/google/callback'
  }
}));

vi.mock('../../config.js', () => ({
  env: configState.env
}));

vi.mock('../../logging/logger.js', () => ({
  appLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

const mockAuthService = {
  generatePasswordResetToken: vi.fn(() => 'placeholder-random-64-char-token'),
  hashPassword: vi.fn(async () => '$2b$12$fakehashforoauthplaceholderuser'),
  generateTokens: vi.fn(() => ({
    accessToken: 'fake-access',
    refreshToken: 'fake-refresh'
  })),
  hashRefreshToken: vi.fn(() => 'fake-refresh-hash'),
  refreshTokenExpiryMs: vi.fn(() => 7 * 24 * 60 * 60 * 1000)
};

vi.mock('../../services/authService.js', () => ({
  authService: mockAuthService
}));

// --- Fixtures ------------------------------------------------------------

const passwordUser: User & { password_hash: string } = {
  user_id: 'user-password-1',
  email: 'victim@example.com',
  name: 'Victim',
  role: 'user',
  email_verified: true,
  auth_provider: 'password',
  password_hash: '$2b$12$realbcrypthashfromregisterflow',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  last_login_at: null
};

const googleUser: User & { password_hash: string } = {
  user_id: 'user-google-1',
  email: 'alreadygoogle@example.com',
  name: 'G User',
  role: 'user',
  email_verified: true,
  auth_provider: 'google',
  password_hash: '$2b$12$placeholderforoauthuser',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  last_login_at: null
};

function makeUserRepo(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    findByEmail: vi.fn(async () => null),
    findById: vi.fn(async (id: string) => ({ ...googleUser, user_id: id })),
    create: vi.fn(async (input: { email: string; name: string; auth_provider?: string }) => ({
      user_id: 'new-user',
      email: input.email,
      name: input.name,
      role: 'user',
      email_verified: false,
      auth_provider: input.auth_provider ?? 'password',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: null
    })),
    updateLastLogin: vi.fn(async () => undefined),
    markEmailVerified: vi.fn(async () => undefined),
    storeRefreshToken: vi.fn(async () => undefined),
    toSafeUser: vi.fn((u: User) => {
      const { ...rest } = u;
      return rest;
    }),
    ...overrides
  };
}

function makeReq(): Request {
  return {
    body: { code: 'fake-google-auth-code' },
    ip: '127.0.0.1',
    get: vi.fn(() => 'test-agent')
  } as unknown as Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function mockGoogleFetch(opts: { verifiedEmail: boolean; email: string; name?: string }) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url);
    if (u.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'ga', id_token: 'gi' })
      } as unknown as Response;
    }
    if (u.includes('googleapis.com/oauth2/v2/userinfo')) {
      return {
        ok: true,
        json: async () => ({
          id: 'google-id-xyz',
          email: opts.email,
          name: opts.name ?? 'Google Name',
          verified_email: opts.verifiedEmail
        })
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// --- Tests ---------------------------------------------------------------

describe('handleGoogleCallback — issue #344 guards', () => {
  let handleGoogleCallback: typeof import('./oauthHandler.js').handleGoogleCallback;
  let handleGoogleAuth: typeof import('./oauthHandler.js').handleGoogleAuth;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    configState.env.googleAuthEnabled = true;
    ({ handleGoogleAuth, handleGoogleCallback } = await import('./oauthHandler.js'));
  });

  it('returns 503 when Google auth is disabled for the beta', async () => {
    configState.env.googleAuthEnabled = false;

    const res = makeRes();
    await handleGoogleAuth(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'GOOGLE_AUTH_DISABLED' })
    );

    const callbackRes = makeRes();
    const repo = makeUserRepo();
    await handleGoogleCallback(makeReq(), callbackRes, repo as never);

    expect(callbackRes.status).toHaveBeenCalledWith(503);
    expect(repo.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects with 400 when Google reports verified_email=false', async () => {
    mockGoogleFetch({ verifiedEmail: false, email: 'attacker@example.com' });
    const repo = makeUserRepo();
    const res = makeRes();

    await handleGoogleCallback(makeReq(), res, repo as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'GOOGLE_EMAIL_NOT_VERIFIED' })
    );
    expect(repo.findByEmail).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects with 400 when verified_email is missing from the response entirely', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token')) {
        return { ok: true, json: async () => ({ access_token: 'ga' }) } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ id: 'x', email: 'x@example.com', name: 'X' }) // no verified_email key
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const repo = makeUserRepo();
    const res = makeRes();

    await handleGoogleCallback(makeReq(), res, repo as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(repo.findByEmail).not.toHaveBeenCalled();
  });

  it('rejects with 409 ACCOUNT_PROVIDER_MISMATCH when email belongs to a password account', async () => {
    mockGoogleFetch({ verifiedEmail: true, email: 'victim@example.com' });
    const repo = makeUserRepo({
      findByEmail: vi.fn(async () => passwordUser)
    });
    const res = makeRes();

    await handleGoogleCallback(makeReq(), res, repo as never);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'ACCOUNT_PROVIDER_MISMATCH' })
    );
    // No JWT issued, no session stored — critical for the takeover guard.
    expect(mockAuthService.generateTokens).not.toHaveBeenCalled();
    expect(repo.storeRefreshToken).not.toHaveBeenCalled();
    expect(repo.updateLastLogin).not.toHaveBeenCalled();
  });

  it('logs in an existing google-provider user and issues JWT tokens', async () => {
    mockGoogleFetch({ verifiedEmail: true, email: 'alreadygoogle@example.com' });
    const repo = makeUserRepo({
      findByEmail: vi.fn(async () => googleUser)
    });
    const res = makeRes();

    await handleGoogleCallback(makeReq(), res, repo as never);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(repo.updateLastLogin).toHaveBeenCalledWith(googleUser.user_id);
    expect(mockAuthService.generateTokens).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ user_id: googleUser.user_id, auth_provider: 'google' }),
        accessToken: 'fake-access',
        refreshToken: 'fake-refresh'
      })
    );
  });

  it('creates a new user with auth_provider=google on first Google sign-in', async () => {
    mockGoogleFetch({ verifiedEmail: true, email: 'new@example.com', name: 'New Google User' });
    const repo = makeUserRepo();
    const res = makeRes();

    await handleGoogleCallback(makeReq(), res, repo as never);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        name: 'New Google User',
        auth_provider: 'google'
      })
    );
    expect(repo.markEmailVerified).toHaveBeenCalled();
    expect(mockAuthService.generateTokens).toHaveBeenCalledTimes(1);
  });
});

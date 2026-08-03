import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  hashPassword,
  generatePasswordResetToken,
  generateTokens,
  hashRefreshToken,
  refreshTokenExpiryMs,
} = vi.hoisted(() => ({
  hashPassword: vi.fn().mockResolvedValue('hash'),
  generatePasswordResetToken: vi.fn().mockReturnValue('rand'),
  generateTokens: vi.fn().mockReturnValue({ accessToken: 'a', refreshToken: 'r' }),
  hashRefreshToken: vi.fn().mockReturnValue('rh'),
  refreshTokenExpiryMs: vi.fn().mockReturnValue(1000),
}));

vi.mock('../../../config.js', () => ({
  env: {
    googleClientId: 'cid',
    googleClientSecret: 'sec',
    googleCallbackUrl: 'http://localhost/callback',
  },
}));

vi.mock('../../../logging/logger.js', () => ({
  appLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../services/authService.js', () => ({
  authService: {
    hashPassword,
    generatePasswordResetToken,
    generateTokens,
    hashRefreshToken,
    refreshTokenExpiryMs,
  },
}));

import type { UserRepository } from '../../../repositories/userRepository.js';
import { handleGoogleCallback } from '../oauthHandler.js';

type GoogleUser = {
  id: string;
  email: string;
  name: string;
  verified_email: boolean;
};

const googleUserStore: { current: GoogleUser | null } = { current: null };

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function mockRepo(overrides: Partial<Record<keyof UserRepository, unknown>> = {}): UserRepository {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    markEmailVerified: vi.fn(),
    findById: vi.fn(),
    updateLastLogin: vi.fn(),
    toSafeUser: vi.fn((u: unknown) => u),
    storeRefreshToken: vi.fn(),
    ...overrides,
  } as unknown as UserRepository;
}

function mockReq(): Request {
  return { body: { code: 'c' }, ip: '1', get: () => 'ua' } as unknown as Request;
}

function mockFetchResponse(body: unknown): globalThis.Response {
  return {
    ok: true,
    json: async () => body,
  } as unknown as globalThis.Response;
}

describe('handleGoogleCallback', () => {
  beforeEach(() => {
    googleUserStore.current = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | globalThis.Request) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return mockFetchResponse({ access_token: 'tok', id_token: 'id' });
        }
        return mockFetchResponse(googleUserStore.current);
      })
    );
  });

  it('rejects unverified Google emails', async () => {
    googleUserStore.current = {
      id: 'g1',
      email: 'a@x.com',
      name: 'A',
      verified_email: false,
    };
    const res = mockRes();
    await handleGoogleCallback(mockReq(), res, mockRepo());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks silent merge into unverified password account', async () => {
    googleUserStore.current = {
      id: 'g1',
      email: 'a@x.com',
      name: 'A',
      verified_email: true,
    };
    const existing = { user_id: 'u1', email: 'a@x.com', email_verified: false };
    const res = mockRes();
    await handleGoogleCallback(
      mockReq(),
      res,
      mockRepo({ findByEmail: vi.fn().mockResolvedValue(existing) })
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('logs into verified existing account', async () => {
    googleUserStore.current = {
      id: 'g1',
      email: 'a@x.com',
      name: 'A',
      verified_email: true,
    };
    const existing = { user_id: 'u1', email: 'a@x.com', email_verified: true };
    const repo = mockRepo({
      findByEmail: vi.fn().mockResolvedValue(existing),
      toSafeUser: vi.fn().mockReturnValue(existing),
    });
    const res = mockRes();
    await handleGoogleCallback(mockReq(), res, repo);
    expect(repo.updateLastLogin).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const hashPassword = vi.fn().mockResolvedValue('hash');
const generatePasswordResetToken = vi.fn().mockReturnValue('rand');
const generateTokens = vi.fn().mockReturnValue({ accessToken: 'a', refreshToken: 'r' });
const hashRefreshToken = vi.fn().mockReturnValue('rh');
const refreshTokenExpiryMs = vi.fn().mockReturnValue(1000);

vi.mock('../../../services/authService.js', () => ({
  authService: {
    hashPassword,
    generatePasswordResetToken,
    generateTokens,
    hashRefreshToken,
    refreshTokenExpiryMs,
  },
}));

import { handleGoogleCallback } from '../oauthHandler.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockRepo(overrides: Record<string, unknown> = {}) {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    markEmailVerified: vi.fn(),
    findById: vi.fn(),
    updateLastLogin: vi.fn(),
    toSafeUser: vi.fn((u) => u),
    storeRefreshToken: vi.fn(),
    ...overrides,
  } as any;
}

describe('handleGoogleCallback', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('oauth2.googleapis.com/token')) {
          return { ok: true, json: async () => ({ access_token: 'tok', id_token: 'id' }) } as any;
        }
        return {
          ok: true,
          json: async () => (globalThis as any).__googleUser,
        } as any;
      })
    );
  });

  it('rejects unverified Google emails', async () => {
    (globalThis as any).__googleUser = {
      id: 'g1',
      email: 'a@x.com',
      name: 'A',
      verified_email: false,
    };
    const res = mockRes();
    await handleGoogleCallback({ body: { code: 'c' }, ip: '1', get: () => 'ua' } as any, res, mockRepo());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks silent merge into unverified password account', async () => {
    (globalThis as any).__googleUser = {
      id: 'g1',
      email: 'a@x.com',
      name: 'A',
      verified_email: true,
    };
    const existing = { user_id: 'u1', email: 'a@x.com', email_verified: false };
    const res = mockRes();
    await handleGoogleCallback(
      { body: { code: 'c' }, ip: '1', get: () => 'ua' } as any,
      res,
      mockRepo({ findByEmail: vi.fn().mockResolvedValue(existing) })
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('logs into verified existing account', async () => {
    (globalThis as any).__googleUser = {
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
    await handleGoogleCallback({ body: { code: 'c' }, ip: '1', get: () => 'ua' } as any, res, repo);
    expect(repo.updateLastLogin).toHaveBeenCalledWith('u1');
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

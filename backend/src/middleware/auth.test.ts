import type { Response, NextFunction } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AuthRequest } from '../types/auth.js';
import type { User } from '../types/user.js';

const mocks = vi.hoisted(() => {
  const findById = vi.fn();
  const query = vi.fn();
  const getDbPool = vi.fn(() => ({ query }));
  const hasDatabaseConfiguration = vi.fn(() => true);
  const verifyAccessToken = vi.fn();
  const hashPassword = vi.fn();
  const envMock = { devBypassEmailVerification: false, benchmarkAuthBypass: false };
  return {
    findById,
    query,
    getDbPool,
    hasDatabaseConfiguration,
    verifyAccessToken,
    hashPassword,
    envMock
  };
});

vi.mock('../config.js', () => ({
  env: mocks.envMock
}));

vi.mock('../db.js', () => ({
  getDbPool: mocks.getDbPool,
  hasDatabaseConfiguration: mocks.hasDatabaseConfiguration
}));

vi.mock('../repositories/userRepository.js', () => {
  return {
    UserRepository: class {
      findById = mocks.findById;
    }
  };
});

vi.mock('../services/authService.js', () => ({
  authService: {
    verifyAccessToken: mocks.verifyAccessToken,
    hashPassword: mocks.hashPassword
  }
}));

import { requireAuth, optionalAuth } from './auth.js';

function makeReq(authHeader?: string): AuthRequest {
  return { headers: { authorization: authHeader } } as unknown as AuthRequest;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  };
  return res as unknown as Response;
}

const verifiedUser: User = {
  user_id: 'u1',
  email: 'a@b.com',
  name: 'A',
  role: 'user',
  email_verified: true,
  auth_provider: 'password',
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: null
};

const unverifiedUser: User = { ...verifiedUser, user_id: 'u2', email_verified: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.envMock.devBypassEmailVerification = false;
  mocks.envMock.benchmarkAuthBypass = false;
  mocks.hasDatabaseConfiguration.mockReturnValue(true);
  mocks.hashPassword.mockResolvedValue('benchmark-bypass-hash');
  mocks.query.mockImplementation(async (_sql: string, params: unknown[]) => ({
    rows: [
      {
        user_id: params[0],
        email: params[1],
        name: params[3],
        role: params[4],
        email_verified: true,
        auth_provider: 'password',
        created_at: new Date(0),
        updated_at: new Date(0),
        last_login_at: null
      }
    ]
  }));
});

describe('requireAuth', () => {
  it('returns 403 when user email is not verified', async () => {
    const req = makeReq('Bearer tok');
    const res = makeRes();
    const next: NextFunction = vi.fn();

    mocks.verifyAccessToken.mockReturnValue({ userId: 'u2', email: 'a@b.com', role: 'user' });
    mocks.findById.mockResolvedValue(unverifiedUser);

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email not verified' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and attaches user when email is verified', async () => {
    const req = makeReq('Bearer tok');
    const res = makeRes();
    const next: NextFunction = vi.fn();

    mocks.verifyAccessToken.mockReturnValue({ userId: 'u1', email: 'a@b.com', role: 'user' });
    mocks.findById.mockResolvedValue(verifiedUser);

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as AuthRequest).user).toEqual(verifiedUser);
  });

  it('attaches a synthetic user when benchmark auth bypass headers are present', async () => {
    const req = {
      headers: {
        'x-benchmark-user-id': 'benchmark-user-1',
        'x-benchmark-user-email': 'benchmark@example.local',
        'x-benchmark-user-name': 'Benchmark User'
      }
    } as unknown as AuthRequest;
    const res = makeRes();
    const next: NextFunction = vi.fn();

    mocks.envMock.benchmarkAuthBypass = true;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({
      user_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ),
      email: 'benchmark@example.local',
      name: 'Benchmark User',
      email_verified: true
    });
    expect(req.user?.user_id).not.toBe('benchmark-user-1');
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });
});

describe('optionalAuth', () => {
  it('does not attach user when email is not verified', async () => {
    const req = makeReq('Bearer tok');
    const res = makeRes();
    const next: NextFunction = vi.fn();

    mocks.verifyAccessToken.mockReturnValue({ userId: 'u2', email: 'a@b.com', role: 'user' });
    mocks.findById.mockResolvedValue(unverifiedUser);

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as AuthRequest).user).toBeUndefined();
  });

  it('attaches user when email is verified', async () => {
    const req = makeReq('Bearer tok');
    const res = makeRes();
    const next: NextFunction = vi.fn();

    mocks.verifyAccessToken.mockReturnValue({ userId: 'u1', email: 'a@b.com', role: 'user' });
    mocks.findById.mockResolvedValue(verifiedUser);

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as AuthRequest).user).toEqual(verifiedUser);
  });

  it('attaches a synthetic benchmark user without touching the database', async () => {
    const req = {
      headers: {
        'x-benchmark-user-id': 'benchmark-user-2'
      }
    } as unknown as AuthRequest;
    const res = makeRes();
    const next: NextFunction = vi.fn();

    mocks.envMock.benchmarkAuthBypass = true;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({
      user_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ),
      email: 'benchmark-user-2@benchmark.local'
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });
});

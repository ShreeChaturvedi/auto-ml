import type { Response, NextFunction } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AuthRequest } from '../types/auth.js';
import type { User } from '../types/user.js';

const mocks = vi.hoisted(() => {
  const findById = vi.fn();
  const verifyAccessToken = vi.fn();
  return { findById, verifyAccessToken };
});

vi.mock('../db.js', () => ({
  getDbPool: vi.fn(),
  hasDatabaseConfiguration: vi.fn(() => true)
}));

vi.mock('../repositories/userRepository.js', () => {
  return {
    UserRepository: class {
      findById = mocks.findById;
    }
  };
});

vi.mock('../services/authService.js', () => ({
  authService: { verifyAccessToken: mocks.verifyAccessToken }
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
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: null
};

const unverifiedUser: User = { ...verifiedUser, user_id: 'u2', email_verified: false };

beforeEach(() => {
  vi.clearAllMocks();
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
});

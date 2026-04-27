import express, { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_USER } from '../tests/fixtures.js';

const {
  findByEmailMock,
  createMock,
  updateLastLoginMock,
  findByIdMock,
  markEmailVerifiedMock,
  storeRefreshTokenMock,
  storeEmailVerificationTokenMock,
  verifyPasswordMock,
  hashPasswordMock,
  generateTokensMock,
  hashRefreshTokenMock,
  refreshTokenExpiryMsMock,
  sendVerificationEmailMock,
  isConfiguredMock,
  appLoggerInfoMock,
} = vi.hoisted(() => ({
  findByEmailMock: vi.fn(),
  createMock: vi.fn(),
  updateLastLoginMock: vi.fn(),
  findByIdMock: vi.fn(),
  markEmailVerifiedMock: vi.fn(),
  storeRefreshTokenMock: vi.fn(),
  storeEmailVerificationTokenMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  generateTokensMock: vi.fn(),
  hashRefreshTokenMock: vi.fn(),
  refreshTokenExpiryMsMock: vi.fn(),
  sendVerificationEmailMock: vi.fn(),
  isConfiguredMock: vi.fn(),
  appLoggerInfoMock: vi.fn(),
}));

vi.mock('../config.js', () => ({
  env: {
    nodeEnv: 'development',
    devBypassEmailVerification: true,
    benchmarkAuthBypass: false,
  }
}));

vi.mock('../repositories/userRepository.js', () => ({
  UserRepository: class MockUserRepository {
    findByEmail = findByEmailMock;
    create = createMock;
    updateLastLogin = updateLastLoginMock;
    findById = findByIdMock;
    markEmailVerified = markEmailVerifiedMock;
    storeRefreshToken = storeRefreshTokenMock;
    storeEmailVerificationToken = storeEmailVerificationTokenMock;

    toSafeUser(user: typeof TEST_USER & { password_hash?: string }) {
      const safe = { ...user };
      delete safe.password_hash;
      return safe;
    }
  }
}));

vi.mock('../services/authService.js', () => ({
  authService: {
    verifyPassword: verifyPasswordMock,
    hashPassword: hashPasswordMock,
    generateTokens: generateTokensMock,
    hashRefreshToken: hashRefreshTokenMock,
    refreshTokenExpiryMs: refreshTokenExpiryMsMock,
  }
}));

vi.mock('../middleware/authRateLimit.js', () => ({
  authAttemptLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next()
}));

vi.mock('../services/emailService.js', () => ({
  emailService: {
    sendVerificationEmail: sendVerificationEmailMock,
    isConfigured: isConfiguredMock,
  }
}));

vi.mock('../logging/logger.js', () => ({
  appLogger: {
    info: appLoggerInfoMock,
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

function createTestApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerAuthRoutes(router, {} as never);
  app.use('/api', router);
  return app;
}

import { registerAuthRoutes } from './auth.js';

describe('auth email-verification bypass contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue(undefined);
    updateLastLoginMock.mockResolvedValue(undefined);
    markEmailVerifiedMock.mockResolvedValue(undefined);
    storeRefreshTokenMock.mockResolvedValue(undefined);
    storeEmailVerificationTokenMock.mockResolvedValue(undefined);
    verifyPasswordMock.mockResolvedValue(true);
    hashPasswordMock.mockResolvedValue('hashed-password');
    generateTokensMock.mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    hashRefreshTokenMock.mockReturnValue('refresh-token-hash');
    refreshTokenExpiryMsMock.mockReturnValue(7 * 24 * 60 * 60 * 1000);
    isConfiguredMock.mockReturnValue(false);
  });

  it('auto-verifies newly registered users when SMTP verification is bypassed', async () => {
    const createdUser = {
      ...TEST_USER,
      email: 'new-user@example.com',
      email_verified: false,
    };
    const verifiedUser = {
      ...createdUser,
      email_verified: true,
    };

    findByEmailMock.mockResolvedValue(null);
    createMock.mockResolvedValue(createdUser);
    findByIdMock.mockResolvedValue(verifiedUser);

    const response = await request(createTestApp())
      .post('/api/auth/register')
      .send({ email: createdUser.email, password: 'CorrectHorseBatteryStaple', name: createdUser.name });

    expect(response.status).toBe(201);
    expect(hashPasswordMock).toHaveBeenCalledWith('CorrectHorseBatteryStaple');
    expect(createMock).toHaveBeenCalledWith({
      email: createdUser.email,
      name: createdUser.name,
      password_hash: 'hashed-password',
    });
    expect(markEmailVerifiedMock).toHaveBeenCalledWith(createdUser.user_id);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
    expect(storeEmailVerificationTokenMock).not.toHaveBeenCalled();
    expect(response.body.user).toMatchObject({
      email: createdUser.email,
      email_verified: true,
    });
  });

  it('returns the refreshed safe user without password_hash', async () => {
    const userWithHash = {
      ...TEST_USER,
      email_verified: false,
      password_hash: '$2b$12$secret-hash',
    };
    const refreshedUser = {
      ...TEST_USER,
      email_verified: true,
      last_login_at: new Date('2026-04-21T18:59:08.035Z'),
    };

    findByEmailMock.mockResolvedValue(userWithHash);
    findByIdMock.mockResolvedValue(refreshedUser);

    const response = await request(createTestApp())
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'CorrectHorseBatteryStaple' });

    expect(response.status).toBe(200);
    expect(updateLastLoginMock).toHaveBeenCalledWith(TEST_USER.user_id);
    expect(findByIdMock).toHaveBeenCalledWith(TEST_USER.user_id);
    expect(response.body.user).toMatchObject({
      user_id: TEST_USER.user_id,
      email: TEST_USER.email,
      email_verified: true,
    });
    expect(response.body.user.last_login_at).toBe('2026-04-21T18:59:08.035Z');
    expect(response.body.user).not.toHaveProperty('password_hash');
  });

  it('self-heals stale unverified users on login when the bypass is active', async () => {
    const userWithHash = {
      ...TEST_USER,
      email_verified: false,
      password_hash: '$2b$12$secret-hash',
    };
    const staleUser = {
      ...TEST_USER,
      email_verified: false,
      last_login_at: new Date('2026-04-21T18:59:08.035Z'),
    };
    const verifiedUser = {
      ...staleUser,
      email_verified: true,
    };

    findByEmailMock.mockResolvedValue(userWithHash);
    findByIdMock
      .mockResolvedValueOnce(staleUser)
      .mockResolvedValueOnce(verifiedUser);

    const response = await request(createTestApp())
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'CorrectHorseBatteryStaple' });

    expect(response.status).toBe(200);
    expect(markEmailVerifiedMock).toHaveBeenCalledWith(TEST_USER.user_id);
    expect(response.body.user).toMatchObject({
      user_id: TEST_USER.user_id,
      email_verified: true,
    });
  });
});

import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearLoginFailures,
  loginRateLimit,
  recordLoginFailure,
  resetLoginRateLimitStateForTests,
} from '../loginRateLimit.js';

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

function mockReq(ip: string, email: string): Request {
  return { ip, body: { email }, socket: {} } as unknown as Request;
}

describe('loginRateLimit', () => {
  beforeEach(() => {
    resetLoginRateLimitStateForTests();
    process.env.AUTH_LOGIN_IP_MAX = '3';
    process.env.AUTH_LOGIN_EMAIL_MAX = '2';
    process.env.AUTH_LOGIN_LOCKOUT_FAILURES = '3';
    process.env.AUTH_LOGIN_LOCKOUT_MS = '60000';
  });

  it('allows requests under the limit', () => {
    const req = mockReq('1.1.1.1', 'a@x.com');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    loginRateLimit(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('429s after per-email max', () => {
    const res = mockRes();
    for (let i = 0; i < 2; i++) {
      loginRateLimit(mockReq('2.2.2.2', 'b@x.com'), mockRes(), vi.fn() as unknown as NextFunction);
    }
    const next = vi.fn() as unknown as NextFunction;
    loginRateLimit(mockReq('2.2.2.2', 'b@x.com'), res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('locks out after repeated failures', () => {
    recordLoginFailure('c@x.com', '3.3.3.3');
    recordLoginFailure('c@x.com', '3.3.3.3');
    recordLoginFailure('c@x.com', '3.3.3.3');
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;
    loginRateLimit(mockReq('3.3.3.3', 'c@x.com'), res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    clearLoginFailures('c@x.com', '3.3.3.3');
  });
});

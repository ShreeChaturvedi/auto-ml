import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLoginFailures,
  loginRateLimit,
  recordLoginFailure,
  resetLoginRateLimitStateForTests,
} from '../loginRateLimit.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
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
    const req: any = { ip: '1.1.1.1', body: { email: 'a@x.com' }, socket: {} };
    const res = mockRes();
    const next = vi.fn();
    loginRateLimit(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('429s after per-email max', () => {
    const res = mockRes();
    for (let i = 0; i < 2; i++) {
      loginRateLimit(
        { ip: '2.2.2.2', body: { email: 'b@x.com' }, socket: {} } as any,
        mockRes(),
        vi.fn()
      );
    }
    const next = vi.fn();
    loginRateLimit(
      { ip: '2.2.2.2', body: { email: 'b@x.com' }, socket: {} } as any,
      res,
      next
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('locks out after repeated failures', () => {
    recordLoginFailure('c@x.com', '3.3.3.3');
    recordLoginFailure('c@x.com', '3.3.3.3');
    recordLoginFailure('c@x.com', '3.3.3.3');
    const res = mockRes();
    const next = vi.fn();
    loginRateLimit(
      { ip: '3.3.3.3', body: { email: 'c@x.com' }, socket: {} } as any,
      res,
      next
    );
    expect(res.status).toHaveBeenCalledWith(429);
    clearLoginFailures('c@x.com', '3.3.3.3');
  });
});

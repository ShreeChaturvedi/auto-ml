import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Force production-mode limit (10) so the test can demonstrate the 11th-hit
// rejection without needing to fire 101 requests.
vi.mock('../config.js', () => ({
  env: { nodeEnv: 'production' }
}));

describe('authAttemptLimiter (issue #345)', () => {
  let app: express.Express;

  beforeEach(async () => {
    // Fresh import to reset the limiter's in-memory bucket between tests.
    vi.resetModules();
    const { authAttemptLimiter } = await import('./authRateLimit.js');
    app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    // Stub handler simulates a failed-login response (401) so
    // skipSuccessfulRequests doesn't clear the bucket.
    app.post('/probe', authAttemptLimiter, (_req, res) => {
      res.status(401).json({ error: 'Invalid email or password' });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows 10 failed attempts from the same (ip, email) then blocks the 11th with 429', async () => {
    const victimEmail = 'victim@example.com';
    const attackerIp = '10.0.0.1';
    const codes: number[] = [];

    for (let i = 0; i < 11; i++) {
      const r = await request(app)
        .post('/probe')
        .set('X-Forwarded-For', attackerIp)
        .send({ email: victimEmail, password: `wrong-${i}` });
      codes.push(r.status);
    }

    expect(codes.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(codes[10]).toBe(429);
  });

  it('scopes the bucket to (ip, email) — the same IP can attempt a different email without sharing the counter', async () => {
    const ip = '10.0.0.2';

    // Burn 10 attempts on email A
    for (let i = 0; i < 10; i++) {
      await request(app).post('/probe').set('X-Forwarded-For', ip).send({ email: 'a@x.com', password: 'w' });
    }

    const blockedOnA = await request(app).post('/probe').set('X-Forwarded-For', ip).send({ email: 'a@x.com', password: 'w' });
    expect(blockedOnA.status).toBe(429);

    // Different email → fresh bucket from the same IP
    const freshOnB = await request(app).post('/probe').set('X-Forwarded-For', ip).send({ email: 'b@x.com', password: 'w' });
    expect(freshOnB.status).toBe(401);
  });

  it('normalizes IPv6 callers within the same subnet into the same bucket', async () => {
    const email = 'ipv6@x.com';
    const ipA = '2001:db8:abcd:1200::1';
    const ipB = '2001:db8:abcd:12aa::2';

    for (let i = 0; i < 10; i++) {
      await request(app).post('/probe').set('X-Forwarded-For', ipA).send({ email, password: 'w' });
    }

    const blockedOnSiblingIp = await request(app)
      .post('/probe')
      .set('X-Forwarded-For', ipB)
      .send({ email, password: 'w' });

    expect(blockedOnSiblingIp.status).toBe(429);
  });

  it('returns a structured 429 body with RATE_LIMITED error_code', async () => {
    const ip = '10.0.0.3';
    for (let i = 0; i < 10; i++) {
      await request(app).post('/probe').set('X-Forwarded-For', ip).send({ email: 'c@x.com', password: 'w' });
    }

    const blocked = await request(app).post('/probe').set('X-Forwarded-For', ip).send({ email: 'c@x.com', password: 'w' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('Too many attempts'),
        error_code: 'RATE_LIMITED'
      })
    );
    // RFC 6585 standard headers
    expect(blocked.headers['ratelimit-limit']).toBe('10');
    expect(blocked.headers['ratelimit-remaining']).toBe('0');
  });

  it('does not count successful responses against the bucket (skipSuccessfulRequests)', async () => {
    // Fresh module import so the count-only-failures handler replaces the
    // default stub handler.
    vi.resetModules();
    const { authAttemptLimiter } = await import('./authRateLimit.js');
    const successApp = express();
    successApp.set('trust proxy', true);
    successApp.use(express.json());
    successApp.post('/probe', authAttemptLimiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const ip = '10.0.0.4';
    for (let i = 0; i < 15; i++) {
      const r = await request(successApp)
        .post('/probe')
        .set('X-Forwarded-For', ip)
        .send({ email: 'ok@x.com', password: 'ok' });
      expect(r.status).toBe(200); // None rate-limited: successes don't consume the bucket.
    }
  });
});

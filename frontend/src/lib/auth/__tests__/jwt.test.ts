import { describe, expect, it } from 'vitest';

import { decodeJwtPayload, isJwtExpired } from '../jwt';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const token = makeJwt({ sub: '123', exp: 999 });
    expect(decodeJwtPayload(token)).toEqual({ sub: '123', exp: 999 });
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });

  it('returns null for garbage base64', () => {
    expect(decodeJwtPayload('a.!!!.b')).toBeNull();
  });
});

describe('isJwtExpired', () => {
  it('returns false for a token expiring in the future', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isJwtExpired(token)).toBe(false);
  });

  it('returns true for a token that has already expired', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(isJwtExpired(token)).toBe(true);
  });

  it('returns true when exp is within the buffer window', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 15 });
    expect(isJwtExpired(token, 30)).toBe(true);
  });

  it('returns true when exp claim is missing (treat as expired)', () => {
    const token = makeJwt({ sub: '123' });
    expect(isJwtExpired(token)).toBe(true);
  });

  it('returns true for a malformed token', () => {
    expect(isJwtExpired('garbage')).toBe(true);
  });
});

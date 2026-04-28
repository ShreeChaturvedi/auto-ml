import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveBenchmarkAuthBypass, resolveJwtSecret } from './config.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveJwtSecret', () => {
  it('throws when JWT_SECRET is missing in production', () => {
    expect(() => resolveJwtSecret(undefined, 'production')).toThrow(
      'FATAL: JWT_SECRET must be set in production'
    );
  });

  it('uses the configured JWT_SECRET in production', () => {
    expect(resolveJwtSecret('prod-secret', 'production')).toBe('prod-secret');
  });

  it('falls back to the dev secret outside production', () => {
    expect(resolveJwtSecret(undefined, 'development')).toBe('dev-secret-change-in-production');
  });
});

describe('resolveBenchmarkAuthBypass', () => {
  it('enables benchmark auth bypass outside production for the canonical env flag', () => {
    expect(resolveBenchmarkAuthBypass('development', 'true')).toBe(true);
  });

  it('does not enable benchmark auth bypass in production', () => {
    expect(resolveBenchmarkAuthBypass('production', 'true')).toBe(false);
  });

  it('keeps benchmark auth bypass disabled when the canonical env flag is unset', () => {
    expect(resolveBenchmarkAuthBypass('development', undefined)).toBe(false);
  });

  it('ignores the legacy benchmark auth bypass alias', () => {
    const legacyEnvName = ['AUTOML', 'BENCHMARK', 'AUTH', 'BYPASS'].join('_');
    vi.stubEnv(legacyEnvName, 'true');

    expect(resolveBenchmarkAuthBypass('development', undefined)).toBe(false);
  });
});

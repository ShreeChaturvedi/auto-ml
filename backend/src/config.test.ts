import { describe, expect, it } from 'vitest';

import { resolveJwtSecret } from './config.js';

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

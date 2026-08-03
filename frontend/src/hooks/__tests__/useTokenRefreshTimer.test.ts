import { describe, expect, it } from 'vitest';
import { shouldWarnSessionExpiring, SESSION_IDLE_WARN_MS } from '../useTokenRefreshTimer';

describe('shouldWarnSessionExpiring', () => {
  it('does not warn while recently active', () => {
    const now = 1_000_000;
    expect(shouldWarnSessionExpiring(now - 1000, now, SESSION_IDLE_WARN_MS)).toBe(false);
  });

  it('warns after true idle', () => {
    const now = 1_000_000;
    expect(shouldWarnSessionExpiring(now - SESSION_IDLE_WARN_MS - 1, now, SESSION_IDLE_WARN_MS)).toBe(true);
  });
});

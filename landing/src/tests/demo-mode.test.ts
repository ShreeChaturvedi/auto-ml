/**
 * Demo-mode API guard regression test.
 *
 * The landing page imports several EASY-tier components directly from the
 * frontend workspace. To prevent those components (or any transitive import)
 * from making real network calls during the marketing demo, `apiFetch` in
 * `frontend/src/lib/api/client.ts` short-circuits as soon as
 * `window.__AGENTIC_DEMO_MODE__ === true` and throws.
 *
 * If a future refactor drops that guard, this test fails and catches the
 * regression before it ships.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from '@frontend/lib/api/client';

describe('demo-mode apiFetch guard', () => {
  const demoWindow = window as unknown as { __AGENTIC_DEMO_MODE__?: boolean };
  let originalFlag: boolean | undefined;

  beforeEach(() => {
    originalFlag = demoWindow.__AGENTIC_DEMO_MODE__;
  });

  afterEach(() => {
    demoWindow.__AGENTIC_DEMO_MODE__ = originalFlag;
    vi.restoreAllMocks();
  });

  it('throws synchronously when the demo-mode flag is set', async () => {
    demoWindow.__AGENTIC_DEMO_MODE__ = true;

    // Spy on fetch so we can prove it was never called — the guard must
    // short-circuit before any network work happens.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 })
    );

    await expect(apiFetch('/projects')).rejects.toThrow('apiFetch called while in demo mode');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws with the exact error message the guard emits', async () => {
    demoWindow.__AGENTIC_DEMO_MODE__ = true;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await expect(apiFetch('/any/path')).rejects.toThrowError(
      new Error('apiFetch called while in demo mode')
    );
  });
});

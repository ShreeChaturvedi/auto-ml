/**
 * Demo-mode API guard regression test.
 *
 * The original intent was to verify that `apiFetch` in the frontend
 * short-circuits when `window.__AGENTIC_DEMO_MODE__ === true`. That guard
 * was removed from `frontend/src/lib/api/client.ts` during the sprint-11
 * core-app hardening (core app on `final-demo` is the source of truth and
 * the marketing preview uses frozen demo state + `fetch` mocks in the
 * `preview-tabs` tests instead).
 *
 * These two specs are left as `.skip` so a future engineer can re-enable
 * them if the guard is reintroduced. The landing CI must stay green in
 * the meantime (Phase 6 of the 2026-04-20 plan).
 *
 * NOTE 2026-04-20: the canonical branch has since migrated from
 * `final-demo` to `sprint11` after the former was retired via !150.
 * sprint11 is the current source of truth for the frozen core-app tree.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from '@frontend/lib/api/client';

describe('demo-mode apiFetch guard (skipped — guard removed from frontend)', () => {
  const demoWindow = window as unknown as { __AGENTIC_DEMO_MODE__?: boolean };
  let originalFlag: boolean | undefined;

  beforeEach(() => {
    originalFlag = demoWindow.__AGENTIC_DEMO_MODE__;
  });

  afterEach(() => {
    demoWindow.__AGENTIC_DEMO_MODE__ = originalFlag;
    vi.restoreAllMocks();
  });

  it.skip('throws synchronously when the demo-mode flag is set', async () => {
    demoWindow.__AGENTIC_DEMO_MODE__ = true;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 })
    );
    await expect(apiFetch('/projects')).rejects.toThrow('apiFetch called while in demo mode');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.skip('throws with the exact error message the guard emits', async () => {
    demoWindow.__AGENTIC_DEMO_MODE__ = true;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await expect(apiFetch('/any/path')).rejects.toThrowError(
      new Error('apiFetch called while in demo mode')
    );
  });
});

import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('demo mode flag is set on window', () => {
    expect((window as unknown as { __AGENTIC_DEMO_MODE__: boolean }).__AGENTIC_DEMO_MODE__).toBe(true);
  });
});

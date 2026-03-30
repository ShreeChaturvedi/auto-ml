import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clampFloatingLeft, FLOATING_VIEWPORT_EDGE_PX } from './clampFloatingLeft';

function mockEl(width: number): HTMLElement {
  return { getBoundingClientRect: () => ({ width }) } as HTMLElement;
}

describe('clampFloatingLeft', () => {
  const innerWidth = 400;

  beforeEach(() => {
    vi.stubGlobal('innerWidth', innerWidth);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns preferred left when the box fits', () => {
    expect(clampFloatingLeft(mockEl(100), 50)).toBe(50);
  });

  it('shifts left when overflowing the right edge', () => {
    const w = 200;
    const preferred = innerWidth - 20;
    expect(clampFloatingLeft(mockEl(w), preferred)).toBe(innerWidth - FLOATING_VIEWPORT_EDGE_PX - w);
  });

  it('does not go past the left edge', () => {
    expect(clampFloatingLeft(mockEl(300), -50)).toBe(FLOATING_VIEWPORT_EDGE_PX);
  });
});

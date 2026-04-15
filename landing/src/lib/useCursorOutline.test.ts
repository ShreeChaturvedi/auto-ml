import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCursorOutline } from './useCursorOutline';

// The hook rAF-throttles mousemove updates, so tests must wait one animation
// frame after dispatching a mousemove to observe the CSS custom property writes.
const flushRaf = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('useCursorOutline', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('returns a ref object', () => {
    const { result } = renderHook(() => useCursorOutline());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('sets initial CSS custom properties on attached element', async () => {
    const { result } = renderHook(() => useCursorOutline());
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200 }),
    });
    (result.current.ref as { current: HTMLDivElement | null }).current = el;
    await act(async () => {
      // Manually trigger the initial property setup via a mousemove event
      const event = new MouseEvent('mousemove', { clientX: 50, clientY: 50 });
      document.dispatchEvent(event);
      await flushRaf();
    });
    // Opacity should be > 0 when cursor is inside the element
    const opacity = el.style.getPropertyValue('--outline-opacity');
    expect(parseFloat(opacity)).toBeGreaterThan(0);
  });

  it('sets opacity to 0 when cursor is far outside the element', async () => {
    const { result } = renderHook(() => useCursorOutline({ proximityThreshold: 100 }));
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    });
    (result.current.ref as { current: HTMLDivElement | null }).current = el;
    await act(async () => {
      const event = new MouseEvent('mousemove', { clientX: 500, clientY: 500 });
      document.dispatchEvent(event);
      await flushRaf();
    });
    const opacity = el.style.getPropertyValue('--outline-opacity');
    expect(parseFloat(opacity)).toBe(0);
  });
});

import { act } from '@testing-library/react';
import { vi } from 'vitest';

export function setupRafAnimationClock() {
  vi.useFakeTimers();

  const requestSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    return window.setTimeout(() => callback(performance.now()), 16);
  });

  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    window.clearTimeout(id);
  });

  return { requestSpy, cancelSpy };
}

export function teardownRafAnimationClock() {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
}

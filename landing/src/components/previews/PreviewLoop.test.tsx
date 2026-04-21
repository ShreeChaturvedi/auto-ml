import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewLoop } from './PreviewLoop';

type IntersectionEntryLike = Pick<IntersectionObserverEntry, 'isIntersecting'>;

let intersectionCallback:
  | ((entries: IntersectionEntryLike[]) => void)
  | undefined;

class TestIntersectionObserver {
  constructor(
    callback: (entries: IntersectionEntryLike[]) => void,
  ) {
    intersectionCallback = callback;
  }

  observe() {
    intersectionCallback?.([{ isIntersecting: false }]);
  }

  disconnect() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function setIntersection(isIntersecting: boolean) {
  act(() => {
    intersectionCallback?.([{ isIntersecting }]);
  });
}

describe('PreviewLoop', () => {
  beforeEach(() => {
    intersectionCallback = undefined;
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      writable: true,
      value: TestIntersectionObserver,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads the underlying media when the preview changes', () => {
    const loadMock = vi.mocked(HTMLMediaElement.prototype.load);
    const { rerender } = render(<PreviewLoop previewId="ingest" />);

    loadMock.mockClear();

    rerender(<PreviewLoop previewId="explore" />);

    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('shows the poster overlay again when the preview source changes', () => {
    const { container, rerender } = render(<PreviewLoop previewId="ingest" />);
    const video = container.querySelector('video');

    expect(video).not.toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);

    Object.defineProperty(video!, 'currentTime', {
      configurable: true,
      writable: true,
      value: 0.3,
    });

    fireEvent.timeUpdate(video!);

    expect(container.querySelectorAll('img')).toHaveLength(0);

    rerender(<PreviewLoop previewId="explore" />);

    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('retries playback when a phase preview becomes visible', () => {
    const playMock = vi.mocked(HTMLMediaElement.prototype.play);
    render(<PreviewLoop previewId="ingest" />);

    playMock.mockClear();

    setIntersection(true);

    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it('does not gate hero playback on viewport visibility', () => {
    const playMock = vi.mocked(HTMLMediaElement.prototype.play);
    render(<PreviewLoop previewId="hero-montage" />);

    expect(playMock).toHaveBeenCalled();
  });
});

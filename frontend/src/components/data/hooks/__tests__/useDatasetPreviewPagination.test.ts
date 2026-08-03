import { describe, expect, it } from 'vitest';

/** Pure helper mirroring the cancel detection used in loadMore. */
function isCancelledLoadError(error: unknown, message: string): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError')
    || (error instanceof Error && /abort|cancel/i.test(error.message))
    || message.includes('abort')
    || message.includes('cancel')
  );
}

describe('preview pagination toast guard', () => {
  it('treats AbortError as non-toastable', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(isCancelledLoadError(err, 'aborted')).toBe(true);
  });

  it('treats real failures as toastable', () => {
    const err = new Error('network down');
    expect(isCancelledLoadError(err, 'network down')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('merges class names with tailwind-merge dedup', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('filters falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('handles arrays and objects via clsx', () => {
    expect(cn(['a'], { b: true, c: false })).toBe('a b');
  });
});

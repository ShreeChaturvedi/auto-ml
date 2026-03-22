import { describe, it, expect } from 'vitest';

import { getErrorMessage } from '../errors.js';

describe('getErrorMessage', () => {
  it('returns the error message for an Error with a non-empty message', () => {
    expect(getErrorMessage(new Error('something broke'), 'fallback')).toBe('something broke');
  });

  it('returns the fallback for an Error with an empty message', () => {
    expect(getErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });

  it('returns the fallback for an Error with a whitespace-only message', () => {
    expect(getErrorMessage(new Error('   '), 'fallback')).toBe('fallback');
  });

  it('returns the fallback for a non-Error value', () => {
    expect(getErrorMessage('string error', 'fallback')).toBe('fallback');
    expect(getErrorMessage(42, 'fallback')).toBe('fallback');
    expect(getErrorMessage({ message: 'not an Error' }, 'fallback')).toBe('fallback');
  });

  it('returns the fallback for null and undefined', () => {
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

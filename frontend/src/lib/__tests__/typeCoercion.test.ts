import { describe, it, expect } from 'vitest';
import {
  asRecord,
  asRecordOrNull,
  asString,
  asNumber,
  asBoolean,
  asStringArray
} from '../typeCoercion';

// ─── asRecord ────────────────────────────────────────────────────────────────

describe('asRecord', () => {
  it('returns the object itself for a plain object', () => {
    const obj = { a: 1, b: 'hello' };
    expect(asRecord(obj)).toBe(obj);
  });

  it('returns {} for null', () => {
    expect(asRecord(null)).toEqual({});
  });

  it('returns {} for undefined', () => {
    expect(asRecord(undefined)).toEqual({});
  });

  it('returns {} for a string', () => {
    expect(asRecord('hello')).toEqual({});
  });

  it('returns {} for a number', () => {
    expect(asRecord(42)).toEqual({});
  });

  it('returns {} for an array', () => {
    expect(asRecord([1, 2, 3])).toEqual({});
  });

  it('returns {} for a boolean', () => {
    expect(asRecord(true)).toEqual({});
  });

  it('returns nested object as-is', () => {
    const nested = { x: { y: 1 } };
    expect(asRecord(nested)).toBe(nested);
  });
});

// ─── asRecordOrNull ───────────────────────────────────────────────────────────

describe('asRecordOrNull', () => {
  it('returns the object itself for a plain object', () => {
    const obj = { key: 'value' };
    expect(asRecordOrNull(obj)).toBe(obj);
  });

  it('returns null for null', () => {
    expect(asRecordOrNull(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(asRecordOrNull(undefined)).toBeNull();
  });

  it('returns null for a string', () => {
    expect(asRecordOrNull('text')).toBeNull();
  });

  it('returns null for a number', () => {
    expect(asRecordOrNull(0)).toBeNull();
  });

  it('returns null for an array', () => {
    expect(asRecordOrNull(['a', 'b'])).toBeNull();
  });

  it('returns null for a boolean', () => {
    expect(asRecordOrNull(false)).toBeNull();
  });

  it('returns nested object as-is', () => {
    const nested = { inner: { deep: true } };
    expect(asRecordOrNull(nested)).toBe(nested);
  });
});

// ─── asString ────────────────────────────────────────────────────────────────

describe('asString', () => {
  it('returns the trimmed string for a non-empty string', () => {
    expect(asString('hello')).toBe('hello');
  });

  it('trims surrounding whitespace', () => {
    expect(asString('  hello  ')).toBe('hello');
  });

  it('returns undefined for an empty string', () => {
    expect(asString('')).toBeUndefined();
  });

  it('returns undefined for a whitespace-only string', () => {
    expect(asString('   ')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(asString(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(asString(undefined)).toBeUndefined();
  });

  it('returns undefined for a number', () => {
    expect(asString(42)).toBeUndefined();
  });

  it('returns undefined for a boolean', () => {
    expect(asString(true)).toBeUndefined();
  });

  it('returns undefined for an object', () => {
    expect(asString({ a: 1 })).toBeUndefined();
  });
});

// ─── asNumber ────────────────────────────────────────────────────────────────

describe('asNumber', () => {
  it('returns the number for a finite integer', () => {
    expect(asNumber(42)).toBe(42);
  });

  it('returns the number for a finite float', () => {
    expect(asNumber(3.14)).toBe(3.14);
  });

  it('returns the number for zero', () => {
    expect(asNumber(0)).toBe(0);
  });

  it('returns the number for a negative number', () => {
    expect(asNumber(-100)).toBe(-100);
  });

  it('returns undefined for NaN', () => {
    expect(asNumber(NaN)).toBeUndefined();
  });

  it('returns undefined for Infinity', () => {
    expect(asNumber(Infinity)).toBeUndefined();
  });

  it('returns undefined for -Infinity', () => {
    expect(asNumber(-Infinity)).toBeUndefined();
  });

  it('returns undefined for a string', () => {
    expect(asNumber('42')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(asNumber(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(asNumber(undefined)).toBeUndefined();
  });

  it('returns undefined for a boolean', () => {
    expect(asNumber(true)).toBeUndefined();
  });
});

// ─── asBoolean ───────────────────────────────────────────────────────────────

describe('asBoolean', () => {
  it('returns true for true', () => {
    expect(asBoolean(true)).toBe(true);
  });

  it('returns false for false', () => {
    expect(asBoolean(false)).toBe(false);
  });

  it('returns undefined for null', () => {
    expect(asBoolean(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(asBoolean(undefined)).toBeUndefined();
  });

  it('returns undefined for 0', () => {
    expect(asBoolean(0)).toBeUndefined();
  });

  it('returns undefined for 1', () => {
    expect(asBoolean(1)).toBeUndefined();
  });

  it('returns undefined for a string', () => {
    expect(asBoolean('true')).toBeUndefined();
  });

  it('returns undefined for an object', () => {
    expect(asBoolean({})).toBeUndefined();
  });
});

// ─── asStringArray ────────────────────────────────────────────────────────────

describe('asStringArray', () => {
  it('returns string elements from a homogeneous string array', () => {
    expect(asStringArray(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('filters out non-string elements', () => {
    expect(asStringArray(['hello', 42, null, undefined, true])).toEqual(['hello']);
  });

  it('filters out empty strings', () => {
    expect(asStringArray(['', 'hello', '   '])).toEqual(['hello']);
  });

  it('keeps strings that are non-empty after trimming but returns them as-is', () => {
    // The filter checks trim().length > 0 but keeps the original value
    expect(asStringArray(['  valid  ', ''])).toEqual(['  valid  ']);
  });

  it('returns [] for an empty array', () => {
    expect(asStringArray([])).toEqual([]);
  });

  it('returns [] for null', () => {
    expect(asStringArray(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(asStringArray(undefined)).toEqual([]);
  });

  it('returns [] for a string', () => {
    expect(asStringArray('hello')).toEqual([]);
  });

  it('returns [] for a plain object', () => {
    expect(asStringArray({ a: 'b' })).toEqual([]);
  });

  it('returns [] for a number', () => {
    expect(asStringArray(42)).toEqual([]);
  });

  it('handles arrays where all elements are invalid', () => {
    expect(asStringArray([null, undefined, 0, false, ''])).toEqual([]);
  });
});

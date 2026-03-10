import { describe, expect, it } from 'vitest';

import { asBoolean, asNumber, asRecord, asString } from '../typeCoercion.js';

describe('typeCoercion', () => {
  // ---------------------------------------------------------------------------
  // asRecord
  // ---------------------------------------------------------------------------
  describe('asRecord', () => {
    it('returns a plain object unchanged', () => {
      const obj = { a: 1, b: 'x' };
      expect(asRecord(obj)).toBe(obj);
    });

    it('returns undefined for null', () => {
      expect(asRecord(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(asRecord(undefined)).toBeUndefined();
    });

    it('returns undefined for an array', () => {
      expect(asRecord([1, 2, 3])).toBeUndefined();
    });

    it('returns undefined for a string', () => {
      expect(asRecord('hello')).toBeUndefined();
    });

    it('returns undefined for a number', () => {
      expect(asRecord(42)).toBeUndefined();
    });

    it('returns undefined for a boolean', () => {
      expect(asRecord(true)).toBeUndefined();
    });

    it('returns an empty object unchanged', () => {
      const obj = {};
      expect(asRecord(obj)).toBe(obj);
    });
  });

  // ---------------------------------------------------------------------------
  // asString
  // ---------------------------------------------------------------------------
  describe('asString', () => {
    it('returns a non-empty string trimmed', () => {
      expect(asString('  hello  ')).toBe('hello');
    });

    it('returns undefined for an empty string', () => {
      expect(asString('')).toBeUndefined();
    });

    it('returns undefined for a whitespace-only string', () => {
      expect(asString('   ')).toBeUndefined();
    });

    it('coerces a number to its string representation', () => {
      expect(asString(42)).toBe('42');
      expect(asString(0)).toBe('0');
      expect(asString(-3.14)).toBe('-3.14');
    });

    it('coerces true to "true"', () => {
      expect(asString(true)).toBe('true');
    });

    it('coerces false to "false"', () => {
      expect(asString(false)).toBe('false');
    });

    it('returns undefined for null', () => {
      expect(asString(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(asString(undefined)).toBeUndefined();
    });

    it('returns undefined for an array', () => {
      expect(asString([1, 2])).toBeUndefined();
    });

    it('returns undefined for a plain object', () => {
      expect(asString({ a: 1 })).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // asNumber
  // ---------------------------------------------------------------------------
  describe('asNumber', () => {
    it('returns a finite integer unchanged', () => {
      expect(asNumber(42)).toBe(42);
    });

    it('returns a finite float unchanged', () => {
      expect(asNumber(3.14)).toBe(3.14);
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

    it('parses a numeric string', () => {
      expect(asNumber('42')).toBe(42);
      expect(asNumber('  3.14  ')).toBe(3.14);
    });

    it('returns undefined for a non-numeric string', () => {
      expect(asNumber('abc')).toBeUndefined();
    });

    it('returns undefined for an empty string', () => {
      expect(asNumber('')).toBeUndefined();
    });

    it('returns undefined for a whitespace-only string', () => {
      expect(asNumber('   ')).toBeUndefined();
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

    it('returns undefined for a plain object', () => {
      expect(asNumber({})).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // asBoolean
  // ---------------------------------------------------------------------------
  describe('asBoolean', () => {
    it('returns true unchanged', () => {
      expect(asBoolean(true)).toBe(true);
    });

    it('returns false unchanged', () => {
      expect(asBoolean(false)).toBe(false);
    });

    it('returns undefined for 1 (does not coerce numbers)', () => {
      expect(asBoolean(1)).toBeUndefined();
    });

    it('returns undefined for 0 (does not coerce numbers)', () => {
      expect(asBoolean(0)).toBeUndefined();
    });

    it('returns undefined for the string "true"', () => {
      expect(asBoolean('true')).toBeUndefined();
    });

    it('returns undefined for null', () => {
      expect(asBoolean(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(asBoolean(undefined)).toBeUndefined();
    });

    it('returns undefined for a plain object', () => {
      expect(asBoolean({})).toBeUndefined();
    });
  });
});

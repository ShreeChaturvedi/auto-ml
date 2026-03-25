import { describe, expect, it } from 'vitest';

import { asBoolean, asNumber, asRecord, asString } from '../typeCoercion.js';

describe('typeCoercion', () => {
  // ---------------------------------------------------------------------------
  // asRecord
  // ---------------------------------------------------------------------------
  describe('asRecord', () => {
    it.each([
      [{ a: 1, b: 'x' }, { a: 1, b: 'x' }, true],
      [null, undefined, false],
      [undefined, undefined, false],
      [[1, 2, 3], undefined, false],
      ['hello', undefined, false],
      [42, undefined, false],
      [true, undefined, false],
      [{}, {}, true]
    ])('returns %o for %o', (input, expected, shouldBeSameRef) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = asRecord(input as any);
      if (shouldBeSameRef) {
        expect(result).toBe(input);
      } else {
        expect(result).toEqual(expected);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // asString
  // ---------------------------------------------------------------------------
  describe('asString', () => {
    it.each([
      ['  hello  ', 'hello'],
      ['', undefined],
      ['   ', undefined],
      [42, '42'],
      [0, '0'],
      [-3.14, '-3.14'],
      [true, 'true'],
      [false, 'false'],
      [null, undefined],
      [undefined, undefined],
      [[1, 2], undefined],
      [{ a: 1 }, undefined]
    ])('asString(%o) => %o', (input, expected) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(asString(input as any)).toBe(expected);
    });
  });

  // ---------------------------------------------------------------------------
  // asNumber
  // ---------------------------------------------------------------------------
  describe('asNumber', () => {
    it.each([
      [42, 42],
      [3.14, 3.14],
      [NaN, undefined],
      [Infinity, undefined],
      [-Infinity, undefined],
      ['42', 42],
      ['  3.14  ', 3.14],
      ['abc', undefined],
      ['', undefined],
      ['   ', undefined],
      [null, undefined],
      [undefined, undefined],
      [true, undefined],
      [{}, undefined]
    ])('asNumber(%o) => %o', (input, expected) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(asNumber(input as any)).toBe(expected);
    });
  });

  // ---------------------------------------------------------------------------
  // asBoolean
  // ---------------------------------------------------------------------------
  describe('asBoolean', () => {
    it.each([
      [true, true],
      [false, false],
      [1, undefined],
      [0, undefined],
      ['true', undefined],
      [null, undefined],
      [undefined, undefined],
      [{}, undefined]
    ])('asBoolean(%o) => %o', (input, expected) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(asBoolean(input as any)).toBe(expected);
    });
  });
});

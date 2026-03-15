import { describe, it, expect } from 'vitest';
import { formatAxis } from '../edaFormatters';
import { getSeverityLabel } from '../edaConstants';
import { subsampleRows } from '../edaDataUtils';

describe('getSeverityLabel', () => {
  it('returns Pristine for 100%', () => {
    const result = getSeverityLabel(100);
    expect(result.label).toBe('Pristine');
    expect(result.colorClass).toContain('green');
  });

  it('returns Clean for 99.9%', () => {
    expect(getSeverityLabel(99.9).label).toBe('Clean');
  });

  it('returns Clean for exactly 95%', () => {
    expect(getSeverityLabel(95).label).toBe('Clean');
  });

  it('returns Fair for 94.9%', () => {
    expect(getSeverityLabel(94.9).label).toBe('Fair');
  });

  it('returns Fair for exactly 80%', () => {
    expect(getSeverityLabel(80).label).toBe('Fair');
    expect(getSeverityLabel(80).colorClass).toContain('amber');
  });

  it('returns Poor for 79.9%', () => {
    expect(getSeverityLabel(79.9).label).toBe('Poor');
    expect(getSeverityLabel(79.9).colorClass).toContain('red');
  });

  it('returns Poor for 0%', () => {
    expect(getSeverityLabel(0).label).toBe('Poor');
  });
});

describe('formatAxis', () => {
  it('formats 0 as "0"', () => {
    expect(formatAxis(0)).toBe('0');
  });

  it('formats 1234 with comma separator', () => {
    expect(formatAxis(1234)).toBe('1,234');
  });

  it('formats 1234567 as millions', () => {
    expect(formatAxis(1234567)).toBe('1.23M');
  });

  it('formats 0.001 in scientific notation (abs < 0.01)', () => {
    // abs < 0.01 && value !== 0 -> scientific notation
    expect(formatAxis(0.001)).toBe('1.0e-3');
  });

  it('formats -5000 with comma separator', () => {
    expect(formatAxis(-5000)).toBe('-5,000');
  });

  it('formats very small numbers in scientific notation', () => {
    // abs < 0.01 && value !== 0
    expect(formatAxis(0.005)).toBe('5.0e-3');
    expect(formatAxis(0.009)).toBe('9.0e-3');
  });

  it('formats moderate decimals (0.01 <= abs < 1) with up to 3 places', () => {
    // abs >= 0.01, abs < 1, value !== 0 -> toFixed(3) with trailing zeros stripped
    expect(formatAxis(0.5)).toBe('0.5');
    expect(formatAxis(0.123)).toBe('0.123');
  });

  it('formats billions', () => {
    expect(formatAxis(1_500_000_000)).toBe('1.50B');
  });
});

describe('subsampleRows', () => {
  it('returns the original array when rows.length <= maxRows', () => {
    const rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
    const result = subsampleRows(rows, 5);
    expect(result).toBe(rows); // same reference
    expect(result.length).toBe(3);
  });

  it('returns exactly maxRows when rows.length > maxRows', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ val: i }));
    const result = subsampleRows(rows, 10);
    expect(result.length).toBe(10);
  });

  it('returns evenly-spaced samples', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ val: i }));
    const result = subsampleRows(rows, 10);
    // step = 100/10 = 10 -> indices 0,10,20,...,90
    expect(result[0]).toEqual({ val: 0 });
    expect(result[1]).toEqual({ val: 10 });
    expect(result[9]).toEqual({ val: 90 });
  });

  it('returns the original array when maxRows equals rows.length', () => {
    const rows = [{ a: 1 }, { a: 2 }];
    expect(subsampleRows(rows, 2)).toBe(rows);
  });
});

import { describe, expect, it } from 'vitest';

import {
  createCssCubicBezierEase,
  getCssVarCubicBezierEase,
  parseCssCubicBezier,
} from './cssCubicBezierEase';

describe('parseCssCubicBezier', () => {
  it('parses theme-style values', () => {
    expect(parseCssCubicBezier('cubic-bezier(0.86, 0, 0.07, 1)')).toEqual([
      0.86, 0, 0.07, 1,
    ]);
    expect(parseCssCubicBezier('  cubic-bezier( 0.165 , 0.84 , 0.44 , 1 )  ')).toEqual([
      0.165, 0.84, 0.44, 1,
    ]);
  });

  it('returns null for invalid input', () => {
    expect(parseCssCubicBezier('linear')).toBeNull();
    expect(parseCssCubicBezier('cubic-bezier(0, 1, 2)')).toBeNull();
  });
});

describe('createCssCubicBezierEase', () => {
  it('maps endpoints and stays in range for in-out-quint', () => {
    const ease = createCssCubicBezierEase(0.86, 0, 0.07, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeGreaterThan(0);
    expect(ease(0.5)).toBeLessThan(1);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const y = ease(t);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(1 + 1e-6);
    }
  });
});

describe('getCssVarCubicBezierEase', () => {
  it('uses fallback when the variable is unset', () => {
    const el = document.createElement('div');
    const ease = getCssVarCubicBezierEase(el, '--nonexistent-ease-xyz', [
      0, 0, 1, 1,
    ] as const);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 3);
  });
});

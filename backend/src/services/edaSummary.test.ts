import { describe, it, expect } from 'vitest';

import type { QueryRow } from '../types/query.js';

import { buildEdaSummary } from './edaSummary.js';

describe('edaSummary', () => {
  describe('buildEdaSummary', () => {
    it('returns undefined for empty rows', () => {
      const result = buildEdaSummary([]);
      expect(result).toBeUndefined();
    });

    it('returns summary with numericColumns for numeric data', () => {
      const rows: QueryRow[] = [
        { value: 1 },
        { value: 2 },
        { value: 3 },
        { value: 4 },
        { value: 5 }
      ];
      const result = buildEdaSummary(rows);
      expect(result).toBeDefined();
      expect(result!.numericColumns).toHaveLength(1);
      expect(result!.numericColumns[0].column).toBe('value');
    });

    it('calculates correct numeric statistics', () => {
      const rows: QueryRow[] = [
        { value: 1 },
        { value: 2 },
        { value: 3 },
        { value: 4 },
        { value: 5 }
      ];
      const result = buildEdaSummary(rows);
      const stats = result!.numericColumns[0];

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
      expect(stats.mean).toBe(3);
      expect(stats.median).toBe(3);
    });

    it('calculates quartiles correctly', () => {
      const rows: QueryRow[] = [
        { value: 1 },
        { value: 2 },
        { value: 3 },
        { value: 4 },
        { value: 5 },
        { value: 6 },
        { value: 7 },
        { value: 8 },
        { value: 9 },
        { value: 10 }
      ];
      const result = buildEdaSummary(rows);
      const stats = result!.numericColumns[0];

      // Using linear interpolation: index = (p/100) * (n-1)
      // Q1: (25/100) * 9 = 2.25 -> between values[2]=3 and values[3]=4
      // Q3: (75/100) * 9 = 6.75 -> between values[6]=7 and values[7]=8
      expect(stats.q1).toBeCloseTo(3.25, 1);
      expect(stats.q3).toBeCloseTo(7.75, 1);
    });

    it('detects outliers using IQR method', () => {
      const rows: QueryRow[] = [
        { value: 1 },
        { value: 2 },
        { value: 3 },
        { value: 4 },
        { value: 5 },
        { value: 100 } // Outlier
      ];
      const result = buildEdaSummary(rows);
      expect(result!.numericColumns[0].outlierCount).toBeGreaterThan(0);
    });

    it('calculates standard deviation', () => {
      const rows: QueryRow[] = [
        { value: 2 },
        { value: 4 },
        { value: 4 },
        { value: 4 },
        { value: 5 },
        { value: 5 },
        { value: 7 },
        { value: 9 }
      ];
      const result = buildEdaSummary(rows);
      const stdDev = result!.numericColumns[0].stdDev;
      expect(stdDev).toBeCloseTo(2.138, 2);
    });

    it('calculates skewness for skewed data', () => {
      const rows: QueryRow[] = [
        { value: 1 },
        { value: 1 },
        { value: 2 },
        { value: 2 },
        { value: 3 },
        { value: 10 } // Creates right skew
      ];
      const result = buildEdaSummary(rows);
      const skewness = result!.numericColumns[0].skewness;
      expect(skewness).toBeGreaterThan(0); // Positive skew
    });

    it('returns summary with categoricalColumns for text data', () => {
      const rows: QueryRow[] = [
        { color: 'red' },
        { color: 'blue' },
        { color: 'red' },
        { color: 'green' },
        { color: 'red' }
      ];
      const result = buildEdaSummary(rows)!;
      expect(result.categoricalColumns).toHaveLength(1);
      expect(result.categoricalColumns[0]!.column).toBe('color');
    });

    it('calculates categorical top values', () => {
      const rows: QueryRow[] = [
        { color: 'red' },
        { color: 'blue' },
        { color: 'red' },
        { color: 'green' },
        { color: 'red' }
      ];
      const result = buildEdaSummary(rows)!;
      const catStats = result.categoricalColumns[0]!;

      expect(catStats.mode).toBe('red');
      expect(catStats.uniqueCount).toBe(3);
      expect(catStats.topValues[0].value).toBe('red');
      expect(catStats.topValues[0].count).toBe(3);
    });

    it('handles mixed columns correctly', () => {
      const rows: QueryRow[] = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 35 }
      ];
      const result = buildEdaSummary(rows)!;

      expect(result.numericColumns.some(c => c.column === 'age')).toBe(true);
      expect(result.categoricalColumns.some(c => c.column === 'name')).toBe(true);
    });

    it('counts missing values in categorical columns', () => {
      const rows: QueryRow[] = [
        { color: 'red' },
        { color: null },
        { color: undefined },
        { color: '' },
        { color: 'blue' }
      ];
      const result = buildEdaSummary(rows)!;
      expect(result.categoricalColumns[0]!.missingCount).toBe(3);
    });

    it('calculates data quality metrics', () => {
      const rows: QueryRow[] = [
        { value: 1 },
        { value: 2 },
        { value: null },
        { value: 3 },
        { value: 1 }
      ];
      const result = buildEdaSummary(rows)!;
      const quality = result.dataQuality.find(q => q.column === 'value')!;

      expect(quality).toBeDefined();
      expect(quality.totalCount).toBe(5);
      expect(quality.missingCount).toBe(1);
      expect(quality.missingPercentage).toBe(20);
    });

    it('generates histogram for numeric column', () => {
      const rows: QueryRow[] = Array.from({ length: 100 }, (_, i) => ({ value: i }));
      const result = buildEdaSummary(rows);

      expect(result!.histogram).toBeDefined();
      expect(result!.histogram!.column).toBe('value');
      expect(result!.histogram!.buckets.length).toBeGreaterThan(0);
    });

    it('generates scatter plot for two numeric columns', () => {
      const rows: QueryRow[] = [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 }
      ];
      const result = buildEdaSummary(rows);

      expect(result!.scatter).toBeDefined();
      expect(result!.scatter!.xColumn).toBe('x');
      expect(result!.scatter!.yColumn).toBe('y');
      expect(result!.scatter!.points).toHaveLength(3);
    });

    it('generates correlations for numeric columns', () => {
      const rows: QueryRow[] = [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
        { x: 4, y: 8 },
        { x: 5, y: 10 }
      ];
      const result = buildEdaSummary(rows);

      expect(result!.correlations).toBeDefined();
      expect(result!.correlations!.length).toBeGreaterThan(0);
      // Perfect positive correlation
      expect(result!.correlations![0].coefficient).toBeCloseTo(1, 5);
    });

    it('detects boolean columns', () => {
      const rows: QueryRow[] = [
        { active: true },
        { active: false },
        { active: true }
      ];
      const result = buildEdaSummary(rows)!;
      const quality = result.dataQuality.find(q => q.column === 'active')!;
      expect(quality.dataType).toBe('boolean');
    });

    it('handles numeric strings', () => {
      const rows: QueryRow[] = [
        { value: '10' },
        { value: '20' },
        { value: '30' }
      ];
      const result = buildEdaSummary(rows);
      expect(result!.numericColumns).toHaveLength(1);
      expect(result!.numericColumns[0].mean).toBe(20);
    });

    it('handles single value (no variance)', () => {
      const rows: QueryRow[] = [
        { value: 5 },
        { value: 5 },
        { value: 5 }
      ];
      const result = buildEdaSummary(rows);
      const stats = result!.numericColumns[0];

      expect(stats.stdDev).toBe(0);
      expect(stats.skewness).toBe(0);
      expect(stats.min).toBe(stats.max);
    });

    it('limits scatter points to MAX_SCATTER_POINTS', () => {
      const rows: QueryRow[] = Array.from({ length: 500 }, (_, i) => ({
        x: i,
        y: i * 2
      }));
      const result = buildEdaSummary(rows);

      expect(result!.scatter!.points.length).toBeLessThanOrEqual(200);
    });

    it('handles empty column correctly', () => {
      const rows: QueryRow[] = [
        { value: null },
        { value: undefined },
        { value: '' }
      ];
      const result = buildEdaSummary(rows)!;
      const quality = result.dataQuality.find(q => q.column === 'value')!;
      expect(quality.missingPercentage).toBe(100);
    });
  });
});

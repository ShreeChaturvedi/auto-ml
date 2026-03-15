import { describe, it, expect } from 'vitest';

import type { QueryRow } from '../types/query.js';

import { buildMissingMatrix } from './eda/missingMatrix.js';
import { computeRegressionLine, buildScatterPairs } from './eda/visualizations.js';
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

  describe('computeRegressionLine', () => {
    it('returns slope ~1 and R² ~1 for perfect positive correlation', () => {
      const points = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
      const result = computeRegressionLine(points);
      expect(result).toBeDefined();
      expect(result!.slope).toBeCloseTo(1, 5);
      expect(result!.r2).toBeCloseTo(1, 5);
    });

    it('returns low R² for uncorrelated data', () => {
      // Deliberately scattered points with no linear trend
      const points = [
        { x: 1, y: 10 },
        { x: 2, y: 3 },
        { x: 3, y: 15 },
        { x: 4, y: 1 },
        { x: 5, y: 12 },
        { x: 6, y: 2 },
        { x: 7, y: 14 },
        { x: 8, y: 4 },
      ];
      const result = computeRegressionLine(points);
      expect(result).toBeDefined();
      expect(result!.r2).toBeLessThan(0.2);
    });

    it('returns undefined when all x values are identical', () => {
      const points = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }];
      expect(computeRegressionLine(points)).toBeUndefined();
    });

    it('returns undefined for a single point', () => {
      expect(computeRegressionLine([{ x: 1, y: 1 }])).toBeUndefined();
    });

    it('returns undefined for empty array', () => {
      expect(computeRegressionLine([])).toBeUndefined();
    });
  });

  describe('buildScatterPairs', () => {
    const rows: QueryRow[] = [
      { a: 1, b: 2, c: 10 },
      { a: 2, b: 4, c: 8 },
      { a: 3, b: 6, c: 6 },
      { a: 4, b: 8, c: 4 },
      { a: 5, b: 10, c: 2 },
    ];
    const numericCols = ['a', 'b', 'c'];
    const correlations = [
      { columnA: 'a', columnB: 'b', coefficient: 1.0 },
      { columnA: 'a', columnB: 'c', coefficient: -1.0 },
      { columnA: 'b', columnB: 'c', coefficient: -1.0 },
    ];

    it('generates the correct number of pairs', () => {
      const result = buildScatterPairs(rows, numericCols, correlations);
      expect(result).toBeDefined();
      expect(result!.length).toBe(3);
    });

    it('respects maxPairs cap', () => {
      const result = buildScatterPairs(rows, numericCols, correlations, 2);
      expect(result).toBeDefined();
      expect(result!.length).toBe(2);
    });

    it('returns undefined when correlations array is empty', () => {
      expect(buildScatterPairs(rows, numericCols, [])).toBeUndefined();
    });

    it('works correctly with exactly 2 columns (single pair)', () => {
      const twoColRows: QueryRow[] = [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
      ];
      const result = buildScatterPairs(
        twoColRows,
        ['x', 'y'],
        [{ columnA: 'x', columnB: 'y', coefficient: 1.0 }]
      );
      expect(result).toBeDefined();
      expect(result!.length).toBe(1);
      expect(result![0].xColumn).toBe('x');
      expect(result![0].yColumn).toBe('y');
      expect(result![0].regressionLine).toBeDefined();
    });
  });

  describe('buildMissingMatrix', () => {
    it('produces correct binary values for mixed missing/present data', () => {
      const rows: QueryRow[] = [
        { a: 1, b: null },
        { a: null, b: 'hello' },
        { a: 3, b: '' },
      ];
      const result = buildMissingMatrix(rows, ['a', 'b']);
      expect(result).toBeDefined();
      expect(result!.columns).toEqual(['a', 'b']);
      // row 0: a=present(1), b=null(0)
      expect(result!.matrix[0]).toEqual([1, 0]);
      // row 1: a=null(0), b=present(1)
      expect(result!.matrix[1]).toEqual([0, 1]);
      // row 2: a=present(1), b=''(0)
      expect(result!.matrix[2]).toEqual([1, 0]);
    });

    it('returns undefined when no column has missing values', () => {
      const rows: QueryRow[] = [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ];
      expect(buildMissingMatrix(rows, ['a', 'b'])).toBeUndefined();
    });

    it('respects sampleSize cap', () => {
      // 200 rows, sampleSize=10 -> step = 20, so ~10 sampled rows
      const rows: QueryRow[] = Array.from({ length: 200 }, (_, i) => ({
        a: i,
        b: i % 5 === 0 ? null : i,
      }));
      const result = buildMissingMatrix(rows, ['a', 'b'], 10);
      expect(result).toBeDefined();
      expect(result!.matrix.length).toBeLessThanOrEqual(10);
    });

    it('returns undefined for empty rows', () => {
      expect(buildMissingMatrix([], ['a', 'b'])).toBeUndefined();
    });

    it('returns undefined for empty columns', () => {
      const rows: QueryRow[] = [{ a: 1 }];
      expect(buildMissingMatrix(rows, [])).toBeUndefined();
    });
  });
});

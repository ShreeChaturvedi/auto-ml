import { describe, it, expect } from 'vitest';
import { detectInsights } from '../edaInsights';
import type { InsightActionType } from '../edaInsights';
import type { EdaSummary } from '@/types/file';

function makeEdaSummary(overrides: Partial<EdaSummary> = {}): EdaSummary {
  return {
    numericColumns: [],
    categoricalColumns: [],
    dataQuality: [],
    correlations: [],
    ...overrides,
  };
}

describe('detectInsights', () => {
  it('returns empty array for empty EDA', () => {
    expect(detectInsights(makeEdaSummary())).toEqual([]);
  });

  it('detects high missing values (> 30%)', () => {
    const eda = makeEdaSummary({
      dataQuality: [{
        column: 'age', dataType: 'numeric', totalCount: 100,
        missingCount: 35, missingPercentage: 35, uniqueCount: 60, uniquePercentage: 60,
      }],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'high', columns: ['age'],
    }));
  });

  it('detects moderate missing values (5-30%)', () => {
    const eda = makeEdaSummary({
      dataQuality: [{
        column: 'income', dataType: 'numeric', totalCount: 100,
        missingCount: 10, missingPercentage: 10, uniqueCount: 80, uniquePercentage: 80,
      }],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'low', id: expect.stringContaining('missing'),
    }));
  });

  it('detects constant columns', () => {
    const eda = makeEdaSummary({
      dataQuality: [{
        column: 'status', dataType: 'categorical', totalCount: 100,
        missingCount: 0, missingPercentage: 0, uniqueCount: 1, uniquePercentage: 1,
      }],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'high', id: 'constant-status',
    }));
  });

  it('detects significant outliers (> 5%)', () => {
    const eda = makeEdaSummary({
      numericColumns: [{
        column: 'price', min: 0, max: 1000, mean: 50, median: 40,
        stdDev: 100, skewness: 0.5, q1: 20, q3: 70, outlierCount: 8,
      }],
      dataQuality: [{
        column: 'price', dataType: 'numeric', totalCount: 100,
        missingCount: 0, missingPercentage: 0, uniqueCount: 95, uniquePercentage: 95,
      }],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'medium', id: 'outlier-price',
    }));
  });

  it('detects high skewness (|skewness| > 2)', () => {
    const eda = makeEdaSummary({
      numericColumns: [{
        column: 'salary', min: 0, max: 1000000, mean: 50000, median: 40000,
        stdDev: 100000, skewness: 3.5, q1: 20000, q3: 70000, outlierCount: 0,
      }],
      dataQuality: [],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'medium', id: 'skew-high-salary',
    }));
  });

  it('detects moderate skewness (1 < |skewness| <= 2)', () => {
    const eda = makeEdaSummary({
      numericColumns: [{
        column: 'age', min: 0, max: 100, mean: 35, median: 30,
        stdDev: 15, skewness: 1.5, q1: 25, q3: 45, outlierCount: 0,
      }],
      dataQuality: [],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'low', id: 'skew-mod-age',
    }));
  });

  it('detects near-perfect correlation (|r| > 0.9)', () => {
    const eda = makeEdaSummary({
      correlations: [{
        columnA: 'height', columnB: 'wingspan', coefficient: 0.95,
      }],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'medium', id: 'corr-height-wingspan',
    }));
  });

  it('detects high cardinality', () => {
    const eda = makeEdaSummary({
      dataQuality: [{
        column: 'id', dataType: 'categorical', totalCount: 100,
        missingCount: 0, missingPercentage: 0, uniqueCount: 98, uniquePercentage: 98,
      }],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'medium', id: 'cardinality-id',
    }));
  });

  it('detects class imbalance (top value > 80%)', () => {
    const eda = makeEdaSummary({
      categoricalColumns: [{
        column: 'label', uniqueCount: 3, missingCount: 0, mode: 'A',
        topValues: [
          { value: 'A', count: 85, percentage: 85 },
          { value: 'B', count: 10, percentage: 10 },
          { value: 'C', count: 5, percentage: 5 },
        ],
      }],
    });
    const insights = detectInsights(eda);
    expect(insights).toContainEqual(expect.objectContaining({
      severity: 'low', id: 'imbalance-label',
    }));
  });

  it('sorts by severity then column name', () => {
    const eda = makeEdaSummary({
      numericColumns: [{
        column: 'z_col', min: 0, max: 100, mean: 50, median: 50,
        stdDev: 10, skewness: 1.5, q1: 40, q3: 60, outlierCount: 0,
      }],
      dataQuality: [
        {
          column: 'a_col', dataType: 'numeric', totalCount: 100,
          missingCount: 50, missingPercentage: 50, uniqueCount: 50, uniquePercentage: 50,
        },
        {
          column: 'b_col', dataType: 'categorical', totalCount: 100,
          missingCount: 0, missingPercentage: 0, uniqueCount: 1, uniquePercentage: 1,
        },
      ],
    });
    const insights = detectInsights(eda);
    // High severity should come first
    const highInsights = insights.filter(i => i.severity === 'high');
    expect(highInsights.length).toBeGreaterThanOrEqual(2);
    expect(highInsights[0].columns[0].localeCompare(highInsights[1].columns[0])).toBeLessThanOrEqual(0);
  });

  // ---------- Insight action tests ----------

  /** Helper to extract action types from an insight */
  function actionTypes(insightId: string, eda: EdaSummary): InsightActionType[] {
    const insight = detectInsights(eda).find(i => i.id === insightId);
    return insight ? insight.actions.map(a => a.type) : [];
  }

  it('all insights have a non-empty actions array', () => {
    const eda = makeEdaSummary({
      numericColumns: [{
        column: 'x', min: 0, max: 100, mean: 50, median: 50,
        stdDev: 10, skewness: 3.0, q1: 40, q3: 60, outlierCount: 10,
      }],
      dataQuality: [
        {
          column: 'x', dataType: 'numeric', totalCount: 100,
          missingCount: 40, missingPercentage: 40, uniqueCount: 90, uniquePercentage: 90,
        },
        {
          column: 'y', dataType: 'categorical', totalCount: 100,
          missingCount: 0, missingPercentage: 0, uniqueCount: 1, uniquePercentage: 1,
        },
      ],
      correlations: [{ columnA: 'a', columnB: 'b', coefficient: 0.95 }],
      categoricalColumns: [{
        column: 'cls', uniqueCount: 2, missingCount: 0, mode: 'A',
        topValues: [{ value: 'A', count: 90, percentage: 90 }],
      }],
    });
    const insights = detectInsights(eda);
    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      expect(insight.actions.length).toBeGreaterThan(0);
    }
  });

  it('missing values insight has filter, query, preprocess, notebook actions', () => {
    const eda = makeEdaSummary({
      dataQuality: [{
        column: 'age', dataType: 'numeric', totalCount: 100,
        missingCount: 35, missingPercentage: 35, uniqueCount: 60, uniquePercentage: 60,
      }],
    });
    expect(actionTypes('missing-high-age', eda)).toEqual(['filter', 'query', 'preprocess', 'notebook']);
  });

  it('outlier insight has filter, query, notebook actions with q1/q3/iqr context', () => {
    const eda = makeEdaSummary({
      numericColumns: [{
        column: 'price', min: 0, max: 1000, mean: 50, median: 40,
        stdDev: 100, skewness: 0.5, q1: 20, q3: 70, outlierCount: 8,
      }],
      dataQuality: [{
        column: 'price', dataType: 'numeric', totalCount: 100,
        missingCount: 0, missingPercentage: 0, uniqueCount: 95, uniquePercentage: 95,
      }],
    });
    expect(actionTypes('outlier-price', eda)).toEqual(['filter', 'query', 'notebook']);
    const insight = detectInsights(eda).find(i => i.id === 'outlier-price')!;
    // All actions should carry q1/q3/iqr context
    const filterAction = insight.actions.find(a => a.type === 'filter')!;
    expect(filterAction.context).toEqual({ q1: 20, q3: 70, iqr: 50 });
  });

  it('skewness insight has only notebook action', () => {
    const eda = makeEdaSummary({
      numericColumns: [{
        column: 'salary', min: 0, max: 1000000, mean: 50000, median: 40000,
        stdDev: 100000, skewness: 3.5, q1: 20000, q3: 70000, outlierCount: 0,
      }],
    });
    expect(actionTypes('skew-high-salary', eda)).toEqual(['notebook']);
  });

  it('correlation insight has query and notebook actions', () => {
    const eda = makeEdaSummary({
      correlations: [{ columnA: 'height', columnB: 'wingspan', coefficient: 0.95 }],
    });
    expect(actionTypes('corr-height-wingspan', eda)).toEqual(['query', 'notebook']);
  });

  it('constant column insight has only preprocess action', () => {
    const eda = makeEdaSummary({
      dataQuality: [{
        column: 'status', dataType: 'categorical', totalCount: 100,
        missingCount: 0, missingPercentage: 0, uniqueCount: 1, uniquePercentage: 1,
      }],
    });
    expect(actionTypes('constant-status', eda)).toEqual(['preprocess']);
  });

  it('high cardinality insight has query and notebook actions', () => {
    const eda = makeEdaSummary({
      dataQuality: [{
        column: 'id', dataType: 'categorical', totalCount: 100,
        missingCount: 0, missingPercentage: 0, uniqueCount: 98, uniquePercentage: 98,
      }],
    });
    expect(actionTypes('cardinality-id', eda)).toEqual(['query', 'notebook']);
  });

  it('class imbalance insight has query, preprocess, notebook actions', () => {
    const eda = makeEdaSummary({
      categoricalColumns: [{
        column: 'label', uniqueCount: 3, missingCount: 0, mode: 'A',
        topValues: [
          { value: 'A', count: 85, percentage: 85 },
          { value: 'B', count: 10, percentage: 10 },
          { value: 'C', count: 5, percentage: 5 },
        ],
      }],
    });
    expect(actionTypes('imbalance-label', eda)).toEqual(['query', 'preprocess', 'notebook']);
  });
});

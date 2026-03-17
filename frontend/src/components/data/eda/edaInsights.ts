/**
 * edaInsights — pure functions to auto-detect data insights from EdaSummary.
 * Used by the InsightTicker and Quality panel.
 */

import {
  AlertTriangle,
  MinusCircle,
  Zap,
  TrendingUp,
  Link,
  Fingerprint,
  PieChart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EdaSummary } from '@/types/file';

export type InsightActionType = 'filter' | 'query' | 'preprocess' | 'notebook';
export type InsightIssueType = 'missing' | 'outlier' | 'skew' | 'correlation' | 'constant' | 'cardinality' | 'imbalance';

export interface InsightAction {
  type: InsightActionType;
  columns: string[];
  issueType: InsightIssueType;
  context?: Record<string, unknown>;
}

export interface EdaInsight {
  id: string;
  severity: 'high' | 'medium' | 'low';
  icon: LucideIcon;
  text: string;
  columns: string[];
  actions: InsightAction[];
}

/**
 * Build an array of InsightActions for the given action types.
 */
function buildActions(
  types: InsightActionType[],
  columns: string[],
  issueType: InsightIssueType,
  context?: Record<string, unknown>,
): InsightAction[] {
  return types.map(type => ({ type, columns, issueType, context }));
}

/**
 * Detect insights from EDA summary data.
 * Returns insights sorted by severity (high first), then alphabetically by first column.
 */
export function detectInsights(eda: EdaSummary): EdaInsight[] {
  const insights: EdaInsight[] = [];

  // Pre-build quality lookup map for O(1) access (avoids O(numericCols × dataQuality) nested scan)
  const qualityMap = new Map(eda.dataQuality.map(q => [q.column, q]));

  // Check numeric columns
  for (const col of eda.numericColumns) {
    // Find quality info for this column
    const quality = qualityMap.get(col.column);
    const totalCount = quality?.totalCount ?? 0;

    // HIGH: Significant outliers (> 5% of data)
    if (totalCount > 0 && col.outlierCount > 0) {
      const outlierPct = (col.outlierCount / totalCount) * 100;
      if (outlierPct > 5) {
        const iqr = col.q3 - col.q1;
        insights.push({
          id: `outlier-${col.column}`,
          severity: 'medium',
          icon: Zap,
          text: `${col.column} has ${col.outlierCount} outliers (${outlierPct.toFixed(1)}% of data)`,
          columns: [col.column],
          actions: buildActions(
            ['filter', 'query', 'notebook'],
            [col.column],
            'outlier',
            { q1: col.q1, q3: col.q3, iqr },
          ),
        });
      }
    }

    // HIGH/MEDIUM: Skewness
    const absSkew = Math.abs(col.skewness);
    if (absSkew > 2) {
      const dir = col.skewness > 0 ? 'right' : 'left';
      insights.push({
        id: `skew-high-${col.column}`,
        severity: 'medium',
        icon: TrendingUp,
        text: `${col.column} is highly ${dir}-skewed (${col.skewness.toFixed(2)})`,
        columns: [col.column],
        actions: buildActions(['notebook'], [col.column], 'skew'),
      });
    } else if (absSkew > 1) {
      const dir = col.skewness > 0 ? 'right' : 'left';
      insights.push({
        id: `skew-mod-${col.column}`,
        severity: 'low',
        icon: TrendingUp,
        text: `${col.column} is moderately ${dir}-skewed`,
        columns: [col.column],
        actions: buildActions(['notebook'], [col.column], 'skew'),
      });
    }
  }

  // Check data quality for missing values and constant/cardinality
  for (const q of eda.dataQuality) {
    // HIGH: High missing (> 30%)
    if (q.missingPercentage > 30) {
      insights.push({
        id: `missing-high-${q.column}`,
        severity: 'high',
        icon: AlertTriangle,
        text: `${q.column} has ${q.missingPercentage.toFixed(1)}% missing values`,
        columns: [q.column],
        actions: buildActions(['filter', 'query', 'preprocess', 'notebook'], [q.column], 'missing'),
      });
    }
    // LOW: Moderate missing (5-30%)
    else if (q.missingPercentage > 5) {
      insights.push({
        id: `missing-mod-${q.column}`,
        severity: 'low',
        icon: AlertTriangle,
        text: `${q.column} has ${q.missingPercentage.toFixed(1)}% missing values`,
        columns: [q.column],
        actions: buildActions(['filter', 'query', 'preprocess', 'notebook'], [q.column], 'missing'),
      });
    }

    // HIGH: Constant column (uniqueCount === 1)
    if (q.uniqueCount === 1) {
      insights.push({
        id: `constant-${q.column}`,
        severity: 'high',
        icon: MinusCircle,
        text: `${q.column} is constant — no predictive signal`,
        columns: [q.column],
        actions: buildActions(['preprocess'], [q.column], 'constant'),
      });
    }

    // MEDIUM: High cardinality (unique/total > 90% and unique > 50)
    if (q.totalCount > 0 && q.uniqueCount > 50 && (q.uniqueCount / q.totalCount) > 0.9) {
      insights.push({
        id: `cardinality-${q.column}`,
        severity: 'medium',
        icon: Fingerprint,
        text: `${q.column} has high cardinality (${q.uniqueCount} unique)`,
        columns: [q.column],
        actions: buildActions(['query', 'notebook'], [q.column], 'cardinality'),
      });
    }
  }

  // Check correlations for near-perfect pairs
  if (eda.correlations) {
    for (const corr of eda.correlations) {
      if (Math.abs(corr.coefficient) > 0.9) {
        insights.push({
          id: `corr-${corr.columnA}-${corr.columnB}`,
          severity: 'medium',
          icon: Link,
          text: `${corr.columnA} and ${corr.columnB} are highly correlated (r=${corr.coefficient.toFixed(2)})`,
          columns: [corr.columnA, corr.columnB],
          actions: buildActions(['query', 'notebook'], [corr.columnA, corr.columnB], 'correlation'),
        });
      }
    }
  }

  // Check categorical columns for class imbalance
  for (const cat of eda.categoricalColumns) {
    if (cat.topValues.length > 0 && cat.topValues[0].percentage > 80) {
      insights.push({
        id: `imbalance-${cat.column}`,
        severity: 'low',
        icon: PieChart,
        text: `${cat.column} is imbalanced (${cat.topValues[0].value} = ${cat.topValues[0].percentage.toFixed(1)}%)`,
        columns: [cat.column],
        actions: buildActions(['query', 'preprocess', 'notebook'], [cat.column], 'imbalance'),
      });
    }
  }

  // Sort: high first, then medium, then low. Within same severity, alphabetically by first column.
  const severityOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (a.columns[0] ?? '').localeCompare(b.columns[0] ?? '');
  });

  return insights;
}

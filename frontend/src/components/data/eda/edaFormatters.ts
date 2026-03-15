/**
 * edaFormatters — shared formatting utilities for all EDA components.
 * Consolidates duplicated formatNumber/formatPercentage/truncateText.
 */

import {
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { DataQualitySummary } from '@/types/file';

/**
 * Smart number formatting for data values.
 * Handles millions, thousands, small decimals, and scientific notation.
 *
 * Consolidates the different implementations from:
 * - HistogramChart.tsx:25 (used .toFixed(1) for M/K)
 * - NumericSummaryCards.tsx:12 (used .toFixed(2) for M/K)
 * - ScatterChart.tsx:25 (same as HistogramChart)
 */
export function formatNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return (value / 1_000_000).toFixed(1) + 'M';
  }
  if (Math.abs(value) >= 1_000) {
    return (value / 1_000).toFixed(1) + 'K';
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  if (Math.abs(value) < 0.01 && value !== 0) {
    return value.toExponential(1);
  }
  if (Math.abs(value) < 1) {
    return value.toFixed(3);
  }
  return value.toFixed(1);
}

/**
 * Format a percentage value with consistent precision.
 * Consolidates .toFixed(1) from CategoricalChart.tsx:112 and
 * .toFixed(0) from DataQualityPanel.tsx:209.
 *
 * Uses 1 decimal place for precision, 0 for display-compact contexts.
 */
export function formatPercentage(value: number, compact = false): string {
  return compact ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;
}

/**
 * Truncate text with ellipsis.
 * Consolidates the different thresholds from CategoricalChart.tsx
 * (which used 15 chars in one place and 10 in another).
 */
export function truncateText(text: string, maxLength = 15): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\u2026';
}

/**
 * Get color class for a correlation coefficient.
 * Consolidates from ScatterChart.tsx:92-96 and CorrelationMatrix.tsx:17-66.
 */
export function getCorrelationColor(r: number): string {
  const abs = Math.abs(r);
  if (abs > 0.7) return 'text-green-600 dark:text-green-400';
  if (abs > 0.4) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-muted-foreground';
}

/**
 * Get human-readable label for a correlation coefficient.
 * Consolidates from ScatterChart.tsx:99-106 and CorrelationMatrix.tsx:17-66.
 */
export function getCorrelationLabel(r: number): string {
  const abs = Math.abs(r);
  const direction = r > 0 ? 'positive' : 'negative';
  if (abs > 0.7) return `Strong ${direction}`;
  if (abs > 0.4) return `Moderate ${direction}`;
  if (abs > 0.2) return `Weak ${direction}`;
  return 'No correlation';
}

/**
 * Shared data-type-to-icon mapping.
 * Used by EDAColumnSelector, QualityPanel, and OverviewColumnCards.
 */
export const DATA_TYPE_ICONS: Record<DataQualitySummary['dataType'], typeof Hash> = {
  numeric: Hash,
  categorical: Type,
  datetime: Calendar,
  boolean: ToggleLeft,
  mixed: HelpCircle,
};

/**
 * Shared data-type-to-color mapping for badges.
 */
export const DATA_TYPE_COLORS: Record<DataQualitySummary['dataType'], string> = {
  numeric: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  categorical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  datetime: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  boolean: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  mixed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

/**
 * Get severity label, color class, CSS variable, and icon for a completeness percentage.
 *
 * - 100%:       "Pristine" (green)
 * - 95-99.9%:   "Clean"    (teal)
 * - 80-94.9%:   "Fair"     (amber)
 * - <80%:       "Poor"     (red)
 */
export function getSeverityLabel(completeness: number): {
  label: string;
  colorClass: string;
  colorVar: string;
  icon: typeof CheckCircle2;
} {
  if (completeness >= 100) {
    return { label: 'Pristine', colorClass: 'text-green-500', colorVar: '--eda-pristine', icon: CheckCircle2 };
  }
  if (completeness >= 95) {
    return { label: 'Clean', colorClass: 'text-teal-500', colorVar: '--eda-clean', icon: CheckCircle2 };
  }
  if (completeness >= 80) {
    return { label: 'Fair', colorClass: 'text-amber-500', colorVar: '--eda-fair', icon: AlertTriangle };
  }
  return { label: 'Poor', colorClass: 'text-red-500', colorVar: '--eda-poor', icon: AlertTriangle };
}

/**
 * Smart axis label formatting with thousands separators and compact suffixes.
 *
 * Examples:
 * - 1234       -> "1,234"
 * - 1234567    -> "1.23M"
 * - 0.001      -> "0.001"
 * - -5000      -> "-5,000"
 * - 1500000000 -> "1.50B"
 */
export function formatAxis(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + 'B';
  }
  if (abs >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + 'M';
  }
  if (abs >= 1_000) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
  }
  if (abs < 0.01 && value !== 0) {
    return value.toExponential(1);
  }
  if (abs < 1 && value !== 0) {
    // Keep meaningful decimal places (up to 3)
    return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(1);
}

/**
 * Deterministic subsampling using even step size.
 * If rows.length <= maxRows, returns the original array.
 * Otherwise takes every `step`-th row, capped at maxRows.
 */
export function subsampleRows(
  rows: Record<string, unknown>[],
  maxRows: number,
): Record<string, unknown>[] {
  if (rows.length <= maxRows) return rows;
  const step = Math.floor(rows.length / maxRows);
  const result: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length && result.length < maxRows; i += step) {
    result.push(rows[i]);
  }
  return result;
}

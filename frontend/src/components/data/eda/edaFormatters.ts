/**
 * edaFormatters — shared formatting utilities for all EDA components.
 * Consolidates duplicated formatNumber/formatPercentage/truncateText.
 */

import { getDecimalPrecisionPref } from '@/lib/dataPrefs';

/** Cached decimal precision — read once per module load, not per call. */
let _cachedPrecision: number | null = null;
function getCachedPrecision(): number {
  if (_cachedPrecision === null) _cachedPrecision = getDecimalPrecisionPref();
  return _cachedPrecision;
}
// Invalidate on storage change so the next formatNumber picks up the new value.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'automl-decimal-precision') _cachedPrecision = null;
  });
}

/**
 * Smart number formatting for data values.
 * Handles millions, thousands, small decimals, and scientific notation.
 * Reads decimal precision from user preferences (cached, not per-call).
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
    return value.toFixed(getCachedPrecision());
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

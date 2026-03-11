/**
 * Private helpers shared across preview handlers.
 */

import { percentile } from '@/lib/stats';
import type { Row } from './types';

export function buildSummary(values: Record<string, number[]>) {
  const summary: Record<string, { min: number; max: number; mean: number }> = {};
  Object.entries(values).forEach(([key, nums]) => {
    if (nums.length === 0) return;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
    summary[key] = {
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      mean: Number(mean.toFixed(4)),
    };
  });
  return Object.keys(summary).length > 0 ? summary : undefined;
}

export function buildQuantiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const buckets = 4;
  const edges: number[] = [];
  for (let i = 1; i < buckets; i += 1) {
    edges.push(percentile(sorted, i / buckets));
  }
  edges.push(sorted[sorted.length - 1]);
  return edges;
}

export function buildBins(min: number, max: number, bins: number): number[] {
  const edges: number[] = [];
  const step = (max - min) / bins;
  for (let i = 1; i <= bins; i += 1) {
    edges.push(min + step * i);
  }
  return edges;
}

export function findBin(value: number, edges: number[]): number {
  for (let i = 0; i < edges.length; i += 1) {
    if (value <= edges[i]) return i;
  }
  return edges.length - 1;
}

export function buildTargetStats(
  rows: Row[],
  sourceColumn: string,
  targetColumn: string
): Map<string, number> | null {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const key = String(row[sourceColumn] ?? '');
    const target = coerceNumber(row[targetColumn]);
    if (target === null) continue;
    const entry = sums.get(key) ?? { sum: 0, count: 0 };
    entry.sum += target;
    entry.count += 1;
    sums.set(key, entry);
  }
  if (sums.size === 0) return null;
  const stats = new Map<string, number>();
  sums.forEach((entry, key) => {
    stats.set(key, entry.sum / entry.count);
  });
  return stats;
}

export function getUniqueValues(rows: Row[], column: string): string[] {
  const values = new Set<string>();
  for (const row of rows) {
    values.add(String(row[column] ?? ''));
  }
  return Array.from(values);
}

export function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp);
    }
  }
  return null;
}

export function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

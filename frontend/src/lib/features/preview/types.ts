/**
 * Shared types for preview strategy handlers.
 */

import type { FeatureMethod } from '@/types/feature';

export type Row = Record<string, unknown>;

export type FeatureLike = {
  method: FeatureMethod;
  sourceColumn: string;
  secondaryColumn?: string;
  featureName: string;
  params?: Record<string, unknown>;
};

export interface FeaturePreviewResult {
  columns: string[];
  rows: Array<Row>;
  summary?: Record<string, { min: number; max: number; mean: number }>;
  note?: string;
}

/** Shared context passed to every strategy handler. */
export type PreviewContext = {
  feature: FeatureLike;
  sample: Row[];
  params: Record<string, unknown>;
  sourceColumn: string;
  secondaryColumn: string | undefined;
  summaryValues: Record<string, number[]>;
  addOutputValue: (row: Row, column: string, value: unknown) => void;
  getSource: (row: Row) => unknown;
  getSecondary: (row: Row) => unknown;
  categories: string[];
  categoryMap: Map<string, number>;
};

/** Every strategy returns column names, output rows, and an optional note. */
export type PreviewFn = (ctx: PreviewContext) => {
  columns: string[];
  rows: Row[];
  note?: string;
} | null;

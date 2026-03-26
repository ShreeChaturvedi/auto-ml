import { z } from 'zod';

import type { NlFilterContext } from './service.js';

export const NlFilterResponseSchema = z.object({
  predicates: z.array(z.object({
    field: z.string(),
    operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte', 'contains']),
    value: z.union([z.string(), z.number()]),
  })),
});

export type NlFilterResponse = z.infer<typeof NlFilterResponseSchema>;

const FIELD_ALIASES: Record<string, string> = {
  'f1_score': 'f1',
  'f1score': 'f1',
  'task_type': 'taskType',
  'tasktype': 'taskType',
  'accuracy_score': 'accuracy',
  'model_name': 'name',
  'model': 'algorithm',
};

function stripMetricsPrefix(field: string): string {
  return field.startsWith('metrics.') ? field.slice(8) : field;
}

function fuzzyMatchAlgorithm(value: string, algorithms: string[]): string {
  const lower = value.toLowerCase().replace(/[\s_-]/g, '');
  for (const algo of algorithms) {
    if (algo.toLowerCase().replace(/[\s_-]/g, '').includes(lower)) {
      return algo;
    }
  }
  return value;
}

function normalizeValue(
  value: string | number,
  field: string,
  metricRanges: Record<string, { min: number; max: number }>,
): string | number {
  if (typeof value === 'string') {
    if (value.endsWith('%')) {
      const num = parseFloat(value.slice(0, -1));
      if (Number.isFinite(num)) return num / 100;
    }
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed) && String(parsed) === value.trim()) return parsed;
    return value;
  }
  if (typeof value === 'number' && value > 1) {
    const range = metricRanges[field];
    if (range && range.max <= 1) {
      return value / 100;
    }
  }
  return value;
}

export function createNlFilterNormalizer(ctx: NlFilterContext) {
  return (raw: unknown): unknown => {
    if (!raw || typeof raw !== 'object') return raw;
    const record = raw as Record<string, unknown>;

    const predicates = record.predicates;
    if (!Array.isArray(predicates)) return raw;

    return {
      ...record,
      predicates: predicates.map((pred: unknown) => {
        if (!pred || typeof pred !== 'object') return pred;
        const p = pred as Record<string, unknown>;

        let field = typeof p.field === 'string' ? stripMetricsPrefix(p.field) : '';
        const lower = field.toLowerCase();
        field = FIELD_ALIASES[lower] ?? lower;

        let value = p.value as string | number;
        if (field === 'algorithm' && typeof value === 'string') {
          value = fuzzyMatchAlgorithm(value, ctx.algorithms);
        } else {
          value = normalizeValue(value, field, ctx.metricRanges);
        }

        return { field, operator: p.operator, value };
      }),
    };
  };
}

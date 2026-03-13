/**
 * Feature templates: datetime features.
 */

import type { FeatureTemplate } from '@/types/feature';

export const temporalTemplates: FeatureTemplate[] = [
  {
    id: 'extract_year',
    method: 'extract_year',
    category: 'datetime',
    displayName: 'Extract Year',
    description: 'Extract year component from datetime',
    rationale: 'Capture long-term trends and seasonality.',
    params: {},
    suggestedFor: ['datetime'],
    estimatedImpact: 'medium',
    previewFormula: 'year(date)'
  },
  {
    id: 'extract_month',
    method: 'extract_month',
    category: 'datetime',
    displayName: 'Extract Month',
    description: 'Extract month (1-12) from datetime',
    rationale: 'Capture monthly patterns and seasonality.',
    params: {},
    suggestedFor: ['datetime'],
    estimatedImpact: 'high',
    previewFormula: 'month(date)'
  },
  {
    id: 'extract_weekday',
    method: 'extract_weekday',
    category: 'datetime',
    displayName: 'Extract Day of Week',
    description: 'Extract day of week (0=Monday to 6=Sunday)',
    rationale: 'Capture weekly patterns (weekday vs weekend effects).',
    params: {},
    suggestedFor: ['datetime'],
    estimatedImpact: 'high',
    previewFormula: 'weekday(date)'
  },
  {
    id: 'extract_hour',
    method: 'extract_hour',
    category: 'datetime',
    displayName: 'Extract Hour',
    description: 'Extract hour (0-23) from datetime',
    rationale: 'Capture daily patterns and peak hours.',
    params: {},
    suggestedFor: ['datetime'],
    estimatedImpact: 'high',
    previewFormula: 'hour(datetime)'
  },
  {
    id: 'cyclical_encode',
    method: 'cyclical_encode',
    category: 'datetime',
    displayName: 'Cyclical Encoding',
    description: 'Encode cyclical features using sin/cos',
    rationale: 'Preserves cyclical nature (e.g., December is close to January). Creates 2 features.',
    params: {
      period: {
        type: 'select',
        label: 'Cycle type',
        default: 'month',
        options: [
          { value: 'hour', label: 'Hour (24-hour cycle)' },
          { value: 'weekday', label: 'Day of week (7-day cycle)' },
          { value: 'month', label: 'Month (12-month cycle)' },
          { value: 'day_of_year', label: 'Day of year (365-day cycle)' }
        ]
      }
    },
    suggestedFor: ['datetime'],
    estimatedImpact: 'high',
    previewFormula: 'sin(2π × x/period), cos(2π × x/period)'
  },
  {
    id: 'time_since',
    method: 'time_since',
    category: 'datetime',
    displayName: 'Time Since Reference',
    description: 'Calculate time elapsed since a reference date',
    rationale: 'Measure recency or age. Common for time-to-event features.',
    params: {
      unit: {
        type: 'select',
        label: 'Time unit',
        default: 'days',
        options: [
          { value: 'days', label: 'Days' },
          { value: 'hours', label: 'Hours' },
          { value: 'weeks', label: 'Weeks' },
          { value: 'months', label: 'Months' }
        ]
      }
    },
    suggestedFor: ['datetime'],
    estimatedImpact: 'medium',
    previewFormula: 'now() - date'
  },
];

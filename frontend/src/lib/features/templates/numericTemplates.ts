/**
 * Feature templates: numeric transforms.
 */

import type { FeatureTemplate } from '@/types/feature';

export const numericTemplates: FeatureTemplate[] = [
  {
    id: 'log_transform',
    method: 'log_transform',
    category: 'numeric_transform',
    displayName: 'Log Transform',
    description: 'Apply natural logarithm to reduce right skewness',
    rationale: 'Best for highly right-skewed data with positive values. Compresses large values and spreads small values.',
    params: {
      offset: {
        type: 'number',
        label: 'Offset (add before log)',
        default: 1,
        min: 0,
        step: 0.1
      }
    },
    suggestedFor: ['numeric'],
    suggestedWhen: (col) => (col.min ?? 0) > 0,
    estimatedImpact: 'high',
    previewFormula: 'log(x + offset)'
  },
  {
    id: 'log1p_transform',
    method: 'log1p_transform',
    category: 'numeric_transform',
    displayName: 'Log(1+x) Transform',
    description: 'Numerically stable log transform for values including zero',
    rationale: 'Use when data contains zeros. More numerically stable than log(x+1).',
    params: {},
    suggestedFor: ['numeric'],
    estimatedImpact: 'high',
    previewFormula: 'log(1 + x)'
  },
  {
    id: 'missing_indicator',
    method: 'missing_indicator',
    category: 'numeric_transform',
    displayName: 'Missing Indicator',
    description: 'Create a binary flag for missing values',
    rationale: 'Missingness often carries predictive signal. A binary indicator preserves it without imputation bias.',
    params: {},
    suggestedFor: ['numeric', 'categorical', 'datetime', 'boolean', 'text'],
    estimatedImpact: 'medium',
    previewFormula: 'isnull(x)'
  },
  {
    id: 'sqrt_transform',
    method: 'sqrt_transform',
    category: 'numeric_transform',
    displayName: 'Square Root',
    description: 'Moderate transformation for mildly skewed data',
    rationale: 'Gentler than log transform. Good for count data or moderately skewed distributions.',
    params: {},
    suggestedFor: ['numeric'],
    suggestedWhen: (col) => (col.min ?? 0) >= 0,
    estimatedImpact: 'medium',
    previewFormula: '√x'
  },
  {
    id: 'box_cox',
    method: 'box_cox',
    category: 'numeric_transform',
    displayName: 'Box-Cox Transform',
    description: 'Optimal power transformation for normality',
    rationale: 'Automatically finds the best power parameter λ to make data normal-like. Requires positive values.',
    params: {},
    suggestedFor: ['numeric'],
    suggestedWhen: (col) => (col.min ?? 0) > 0,
    estimatedImpact: 'high',
    previewFormula: '(x^λ - 1) / λ'
  },
  {
    id: 'yeo_johnson',
    method: 'yeo_johnson',
    category: 'numeric_transform',
    displayName: 'Yeo-Johnson Transform',
    description: 'Power transformation that handles negative values',
    rationale: 'Similar to Box-Cox but works with zero and negative values.',
    params: {},
    suggestedFor: ['numeric'],
    estimatedImpact: 'high',
    previewFormula: 'yeo-johnson(x)'
  },
];

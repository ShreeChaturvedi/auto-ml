/**
 * Feature templates: scaling & normalization.
 */

import type { FeatureTemplate } from '@/types/feature';

export const scalingTemplates: FeatureTemplate[] = [
  {
    id: 'standardize',
    method: 'standardize',
    category: 'scaling',
    displayName: 'StandardScaler (Z-score)',
    description: 'Center to mean 0, scale to unit variance',
    rationale: 'Standard approach for most algorithms. Assumes roughly normal distribution.',
    params: {},
    suggestedFor: ['numeric'],
    estimatedImpact: 'medium',
    previewFormula: '(x - μ) / σ'
  },
  {
    id: 'min_max_scale',
    method: 'min_max_scale',
    category: 'scaling',
    displayName: 'MinMax Scaler',
    description: 'Scale to fixed range [0, 1] or custom',
    rationale: 'Good when you need bounded outputs. Sensitive to outliers.',
    params: {
      min: {
        type: 'number',
        label: 'Target minimum',
        default: 0
      },
      max: {
        type: 'number',
        label: 'Target maximum',
        default: 1
      }
    },
    suggestedFor: ['numeric'],
    estimatedImpact: 'medium',
    previewFormula: '(x - min) / (max - min)'
  },
  {
    id: 'robust_scale',
    method: 'robust_scale',
    category: 'scaling',
    displayName: 'RobustScaler',
    description: 'Scale using median and IQR (outlier-resistant)',
    rationale: 'Best choice when data has outliers. Uses median and interquartile range.',
    params: {},
    suggestedFor: ['numeric'],
    estimatedImpact: 'medium',
    previewFormula: '(x - median) / IQR'
  },
];

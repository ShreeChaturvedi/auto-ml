/**
 * Feature templates: binning.
 */

import type { FeatureTemplate } from '@/types/feature';

export const binningTemplates: FeatureTemplate[] = [
  {
    id: 'bucketize',
    method: 'bucketize',
    category: 'numeric_transform',
    displayName: 'Equal-Width Binning',
    description: 'Divide into equal-width intervals',
    rationale: 'Convert continuous to categorical. Can capture non-linear relationships.',
    params: {
      bins: {
        type: 'number',
        label: 'Number of bins',
        default: 5,
        min: 2,
        max: 20
      }
    },
    suggestedFor: ['numeric'],
    estimatedImpact: 'medium',
    previewFormula: 'bin(x, n_bins)'
  },
  {
    id: 'quantile_bin',
    method: 'quantile_bin',
    category: 'numeric_transform',
    displayName: 'Quantile Binning',
    description: 'Divide into bins with equal frequency',
    rationale: 'Each bin has roughly the same number of samples. Better for skewed data.',
    params: {
      quantiles: {
        type: 'number',
        label: 'Number of quantiles',
        default: 4,
        min: 2,
        max: 10
      }
    },
    suggestedFor: ['numeric'],
    estimatedImpact: 'medium',
    previewFormula: 'quantile(x, n)'
  },
];

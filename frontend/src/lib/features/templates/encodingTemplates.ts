/**
 * Feature templates: categorical encoding.
 */

import type { FeatureTemplate } from '@/types/feature';

export const encodingTemplates: FeatureTemplate[] = [
  {
    id: 'one_hot_encode',
    method: 'one_hot_encode',
    category: 'encoding',
    displayName: 'One-Hot Encoding',
    description: 'Create binary indicator columns for each category',
    rationale: 'Standard for low-cardinality categorical features. Creates interpretable features.',
    params: {
      drop_first: {
        type: 'boolean',
        label: 'Drop first category (avoid collinearity)',
        default: false
      }
    },
    suggestedFor: ['categorical'],
    suggestedWhen: (col) => col.uniqueValues <= 10,
    estimatedImpact: 'high',
    previewFormula: 'one_hot(category)'
  },
  {
    id: 'label_encode',
    method: 'label_encode',
    category: 'encoding',
    displayName: 'Label Encoding',
    description: 'Assign integer labels 0, 1, 2, ...',
    rationale: 'Memory-efficient but implies ordering. Best for ordinal categories or tree-based models.',
    params: {},
    suggestedFor: ['categorical', 'text'],
    estimatedImpact: 'medium',
    previewFormula: 'label(category)'
  },
  {
    id: 'target_encode',
    method: 'target_encode',
    category: 'encoding',
    displayName: 'Target Encoding',
    description: 'Encode with mean of target variable',
    rationale: 'Powerful for high-cardinality features. Requires target variable and careful cross-validation.',
    params: {
      targetColumn: {
        type: 'column',
        label: 'Target column',
        default: ''
      },
      smoothing: {
        type: 'number',
        label: 'Smoothing factor',
        default: 1,
        min: 0,
        max: 10,
        step: 0.1
      }
    },
    suggestedFor: ['categorical'],
    suggestedWhen: (col) => col.uniqueValues > 10,
    estimatedImpact: 'high',
    previewFormula: 'mean(target | category)'
  },
  {
    id: 'frequency_encode',
    method: 'frequency_encode',
    category: 'encoding',
    displayName: 'Frequency Encoding',
    description: 'Replace category with its occurrence count',
    rationale: 'Simple and effective for high-cardinality. Preserves frequency information.',
    params: {
      normalize: {
        type: 'boolean',
        label: 'Normalize to percentages',
        default: true
      }
    },
    suggestedFor: ['categorical', 'text'],
    estimatedImpact: 'medium',
    previewFormula: 'count(category) / total'
  },
];

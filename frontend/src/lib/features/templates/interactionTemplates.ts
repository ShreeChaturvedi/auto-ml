/**
 * Feature templates: interactions & combinations.
 */

import type { FeatureTemplate } from '@/types/feature';

export const interactionTemplates: FeatureTemplate[] = [
  {
    id: 'polynomial',
    method: 'polynomial',
    category: 'interaction',
    displayName: 'Polynomial Features',
    description: 'Generate polynomial and interaction features',
    rationale: 'Capture non-linear relationships. Creates x², x³, and cross-terms.',
    params: {
      degree: {
        type: 'number',
        label: 'Polynomial degree',
        default: 2,
        min: 2,
        max: 4
      },
      include_bias: {
        type: 'boolean',
        label: 'Include bias term',
        default: false
      }
    },
    suggestedFor: ['numeric'],
    estimatedImpact: 'high',
    previewFormula: 'x, x², x³, ...'
  },
  {
    id: 'ratio',
    method: 'ratio',
    category: 'interaction',
    displayName: 'Ratio Feature',
    description: 'Create ratio of two numeric columns',
    rationale: 'Capture relative relationships. Common in financial and scientific data.',
    params: {
      secondaryColumn: {
        type: 'column',
        label: 'Secondary column',
        default: ''
      }
    },
    suggestedFor: ['numeric'],
    estimatedImpact: 'high',
    previewFormula: 'x / y'
  },
  {
    id: 'difference',
    method: 'difference',
    category: 'interaction',
    displayName: 'Difference Feature',
    description: 'Calculate difference between two columns',
    rationale: 'Capture relative changes or deltas.',
    params: {
      secondaryColumn: {
        type: 'column',
        label: 'Secondary column',
        default: ''
      }
    },
    suggestedFor: ['numeric'],
    estimatedImpact: 'medium',
    previewFormula: 'x - y'
  },
  {
    id: 'product',
    method: 'product',
    category: 'interaction',
    displayName: 'Product Feature',
    description: 'Multiply two numeric columns',
    rationale: 'Capture multiplicative interactions between features.',
    params: {
      secondaryColumn: {
        type: 'column',
        label: 'Secondary column',
        default: ''
      }
    },
    suggestedFor: ['numeric'],
    estimatedImpact: 'medium',
    previewFormula: 'x × y'
  },
];

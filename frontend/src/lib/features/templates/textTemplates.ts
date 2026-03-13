/**
 * Feature templates: text features.
 */

import type { FeatureTemplate } from '@/types/feature';

export const textTemplates: FeatureTemplate[] = [
  {
    id: 'text_length',
    method: 'text_length',
    category: 'text',
    displayName: 'Text Length',
    description: 'Count number of characters',
    rationale: 'Simple but often predictive. Longer text may indicate different behavior.',
    params: {},
    suggestedFor: ['text', 'categorical'],
    estimatedImpact: 'low',
    previewFormula: 'len(text)'
  },
  {
    id: 'word_count',
    method: 'word_count',
    category: 'text',
    displayName: 'Word Count',
    description: 'Count number of words',
    rationale: 'Measure verbosity or complexity of text.',
    params: {},
    suggestedFor: ['text'],
    estimatedImpact: 'low',
    previewFormula: 'word_count(text)'
  },
  {
    id: 'contains_pattern',
    method: 'contains_pattern',
    category: 'text',
    displayName: 'Contains Pattern',
    description: 'Check if text contains a specific pattern',
    rationale: 'Create binary flag for presence of keywords or patterns.',
    params: {
      pattern: {
        type: 'string',
        label: 'Pattern or keyword',
        default: ''
      },
      case_sensitive: {
        type: 'boolean',
        label: 'Case sensitive',
        default: false
      }
    },
    suggestedFor: ['text'],
    estimatedImpact: 'medium',
    previewFormula: 'pattern in text'
  }
];

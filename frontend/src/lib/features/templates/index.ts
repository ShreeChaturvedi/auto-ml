/**
 * Feature templates barrel — combines all template groups and exports
 * the full FEATURE_TEMPLATES array, category config, and helper functions.
 */

import type { ColumnStatistics } from '@/types/file';
import type { FeatureCategory, FeatureTemplate } from '@/types/feature';

import { numericTemplates } from './numericTemplates';
import { scalingTemplates } from './scalingTemplates';
import { binningTemplates } from './binningTemplates';
import { encodingTemplates } from './encodingTemplates';
import { temporalTemplates } from './temporalTemplates';
import { interactionTemplates } from './interactionTemplates';
import { textTemplates } from './textTemplates';

// Category configuration for UI
export const featureCategoryConfig: Record<FeatureCategory, {
  label: string;
  description: string;
  icon: string;
}> = {
  numeric_transform: {
    label: 'Numeric Transforms',
    description: 'Transform skewed or non-normal distributions',
    icon: 'TrendingUp'
  },
  scaling: {
    label: 'Scaling & Normalization',
    description: 'Normalize feature magnitudes',
    icon: 'Maximize2'
  },
  encoding: {
    label: 'Categorical Encoding',
    description: 'Convert categories to numeric representations',
    icon: 'Hash'
  },
  datetime: {
    label: 'DateTime Features',
    description: 'Extract temporal patterns from dates',
    icon: 'Calendar'
  },
  interaction: {
    label: 'Interactions & Combinations',
    description: 'Create features from column relationships',
    icon: 'GitMerge'
  },
  text: {
    label: 'Text Features',
    description: 'Extract features from text data',
    icon: 'Type'
  },
  aggregation: {
    label: 'Aggregations',
    description: 'Compute rolling or grouped statistics',
    icon: 'Layers'
  }
};

export const FEATURE_TEMPLATES: FeatureTemplate[] = [
  ...numericTemplates,
  ...scalingTemplates,
  ...binningTemplates,
  ...encodingTemplates,
  ...temporalTemplates,
  ...interactionTemplates,
  ...textTemplates,
];

// Helper to get templates by category
export function getTemplatesByCategory(): Record<FeatureCategory, FeatureTemplate[]> {
  const grouped = {} as Record<FeatureCategory, FeatureTemplate[]>;

  for (const category of Object.keys(featureCategoryConfig) as FeatureCategory[]) {
    grouped[category] = FEATURE_TEMPLATES.filter(t => t.category === category);
  }

  return grouped;
}

// Helper to get suggested templates for a column
export function getSuggestedTemplates(col: ColumnStatistics): FeatureTemplate[] {
  return FEATURE_TEMPLATES.filter(template => {
    // Check if column type matches
    if (!template.suggestedFor.includes(col.dataType)) {
      return false;
    }

    // Check additional conditions if specified
    if (template.suggestedWhen && !template.suggestedWhen(col)) {
      return false;
    }

    return true;
  });
}

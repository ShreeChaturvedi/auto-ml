/**
 * Feature Engineering Types
 * 
 * Comprehensive feature templates following industry best practices.
 * Features are organized by category for better UX.
 */

import type { ColumnStatistics } from './file';

// Feature categories for grouping in UI
export type FeatureCategory = 
  | 'numeric_transform'
  | 'scaling'
  | 'encoding'
  | 'datetime'
  | 'interaction'
  | 'text'
  | 'aggregation';

export type FeatureMethod =
  // Numeric transforms
  | 'log_transform'
  | 'log1p_transform'
  | 'sqrt_transform'
  | 'square_transform'
  | 'reciprocal_transform'
  | 'box_cox'
  | 'yeo_johnson'
  // Scaling
  | 'standardize'
  | 'min_max_scale'
  | 'robust_scale'
  | 'max_abs_scale'
  // Binning
  | 'bucketize'
  | 'quantile_bin'
  // Encoding
  | 'one_hot_encode'
  | 'label_encode'
  | 'target_encode'
  | 'frequency_encode'
  | 'binary_encode'
  // DateTime
  | 'extract_year'
  | 'extract_month'
  | 'extract_day'
  | 'extract_weekday'
  | 'extract_hour'
  | 'cyclical_encode'
  | 'time_since'
  // Interactions
  | 'polynomial'
  | 'ratio'
  | 'difference'
  | 'product'
  // Text
  | 'text_length'
  | 'word_count'
  | 'contains_pattern'
  | 'missing_indicator';

export interface FeatureTemplate {
  id: string;
  method: FeatureMethod;
  category: FeatureCategory;
  displayName: string;
  description: string;
  rationale: string;
  params: Record<string, {
    type: 'number' | 'string' | 'boolean' | 'select' | 'column';
    label: string;
    default: unknown;
    options?: Array<{ value: string; label: string }>;
    min?: number;
    max?: number;
    step?: number;
  }>;
  suggestedFor: Array<ColumnStatistics['dataType']>;
  suggestedWhen?: (col: ColumnStatistics) => boolean;
  estimatedImpact: 'high' | 'medium' | 'low';
  previewFormula?: string; // e.g., "log(x + 1)"
}

export interface FeatureSpec {
  id: string;
  projectId: string;
  sourceColumn: string;
  secondaryColumn?: string; // For interaction features
  featureName: string;
  description: string;
  method: FeatureMethod;
  category: FeatureCategory;
  params: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

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
  // ==========================================================================
  // NUMERIC TRANSFORMS
  // ==========================================================================
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

  // ==========================================================================
  // SCALING
  // ==========================================================================
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

  // ==========================================================================
  // BINNING
  // ==========================================================================
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

  // ==========================================================================
  // ENCODING
  // ==========================================================================
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

  // ==========================================================================
  // DATETIME
  // ==========================================================================
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

  // ==========================================================================
  // INTERACTIONS
  // ==========================================================================
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

  // ==========================================================================
  // TEXT
  // ==========================================================================
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

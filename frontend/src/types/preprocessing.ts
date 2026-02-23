/**
 * Preprocessing Types
 * 
 * Types for the preprocessing suggestions and control panel UI.
 */

export type PreprocessingType = 
  | 'missing_values'
  | 'outliers'
  | 'scaling'
  | 'encoding'
  | 'type_conversion'
  | 'skewness'
  | 'high_cardinality'
  | 'constant_column'
  | 'duplicate_detection';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type UIRenderType = 
  | 'toggle'
  | 'slider'
  | 'select'
  | 'number_input'
  | 'range_slider'
  | 'multi_select';

export interface PreprocessingSuggestion {
  id: string;
  type: PreprocessingType;
  column: string;
  severity: Severity;
  title: string;
  description: string;
  method: string;
  methodOptions: string[];
  parameters: Record<string, unknown>;
  uiConfig: {
    renderAs: UIRenderType;
    options?: Array<{ value: string; label: string }>;
    min?: number;
    max?: number;
    step?: number;
    default: unknown;
  };
  impact: string;
  rationale: string;
  enabled: boolean;
}

export interface ColumnProfile {
  name: string;
  inferredType: 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'text';
  totalCount: number;
  missingCount: number;
  missingPercentage: number;
  uniqueCount: number;
  uniquePercentage: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  skewness?: number;
  kurtosis?: number;
  q1?: number;
  q3?: number;
  outlierCount?: number;
  outlierPercentage?: number;
  topValues?: Array<{ value: string; count: number }>;
  entropy?: number;
}

export interface PreprocessingAnalysis {
  rowCount: number;
  columnCount: number;
  duplicateRowCount: number;
  columnProfiles: ColumnProfile[];
  suggestions: PreprocessingSuggestion[];
}

export interface PreprocessingResponse {
  analysis: PreprocessingAnalysis;
  metadata: {
    tableName: string;
    totalRows: number;
    sampledRows: number;
    samplePercentage: number;
  };
}

export interface AvailableTable {
  datasetId: string;
  name: string;
  filename: string;
  sizeBytes: number;
  nRows?: number;
  nCols?: number;
}

// Severity configuration for styling
export const severityConfig: Record<Severity, { 
  color: string; 
  bgColor: string; 
  label: string;
  icon: string;
}> = {
  critical: {
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-950/50',
    label: 'Critical',
    icon: 'AlertOctagon'
  },
  high: {
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-950/50',
    label: 'High',
    icon: 'AlertTriangle'
  },
  medium: {
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-950/50',
    label: 'Medium',
    icon: 'AlertCircle'
  },
  low: {
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-950/50',
    label: 'Low',
    icon: 'Info'
  },
  info: {
    color: 'text-gray-700 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    label: 'Info',
    icon: 'HelpCircle'
  }
};

// Preprocessing type icons
export const preprocessingTypeConfig: Record<PreprocessingType, {
  icon: string;
  label: string;
  description: string;
}> = {
  missing_values: {
    icon: 'CircleDashed',
    label: 'Missing Values',
    description: 'Handle null or empty values'
  },
  outliers: {
    icon: 'TrendingUp',
    label: 'Outliers',
    description: 'Detect and handle extreme values'
  },
  scaling: {
    icon: 'Maximize2',
    label: 'Scaling',
    description: 'Normalize feature ranges'
  },
  encoding: {
    icon: 'Hash',
    label: 'Encoding',
    description: 'Convert categorical to numeric'
  },
  type_conversion: {
    icon: 'RefreshCw',
    label: 'Type Conversion',
    description: 'Change data types'
  },
  skewness: {
    icon: 'BarChart2',
    label: 'Skewness',
    description: 'Transform skewed distributions'
  },
  high_cardinality: {
    icon: 'Layers',
    label: 'High Cardinality',
    description: 'Handle many unique values'
  },
  constant_column: {
    icon: 'Minus',
    label: 'Constant Column',
    description: 'Remove zero-variance features'
  },
  duplicate_detection: {
    icon: 'Copy',
    label: 'Duplicates',
    description: 'Handle duplicate rows'
  }
};




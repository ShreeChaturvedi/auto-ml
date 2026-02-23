/**
 * Preprocessing Suggestions Engine
 * 
 * Generates intelligent, template-based preprocessing suggestions using
 * industry-standard heuristics and statistical analysis.
 * 
 * Key principles:
 * - No hardcoded thresholds - use data-driven decision making
 * - Follow best practices from sklearn, pandas, and domain expertise
 * - Provide actionable, parameter-configurable suggestions
 */

import type { QueryRow } from '../types/query.js';

// ============================================================================
// Types
// ============================================================================

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
  enabled: boolean; // Default state
}

export interface ColumnProfile {
  name: string;
  inferredType: 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'text';
  totalCount: number;
  missingCount: number;
  missingPercentage: number;
  uniqueCount: number;
  uniquePercentage: number;
  // Numeric-specific
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
  // Categorical-specific
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

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeDataForPreprocessing(rows: QueryRow[]): PreprocessingAnalysis {
  if (rows.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      duplicateRowCount: 0,
      columnProfiles: [],
      suggestions: []
    };
  }

  const columns = Object.keys(rows[0]);
  const columnProfiles = columns.map(col => profileColumn(rows, col));
  
  // Detect duplicates
  const rowHashes = new Set<string>();
  let duplicateRowCount = 0;
  for (const row of rows) {
    const hash = JSON.stringify(row);
    if (rowHashes.has(hash)) {
      duplicateRowCount++;
    } else {
      rowHashes.add(hash);
    }
  }

  // Generate suggestions based on profiles
  const suggestions: PreprocessingSuggestion[] = [];
  let suggestionId = 0;

  for (const profile of columnProfiles) {
    const colSuggestions = generateSuggestionsForColumn(profile, rows.length, () => `prep-${++suggestionId}`);
    suggestions.push(...colSuggestions);
  }

  // Add duplicate row suggestion if applicable
  if (duplicateRowCount > 0) {
    const dupPercentage = (duplicateRowCount / rows.length) * 100;
    suggestions.push({
      id: `prep-${++suggestionId}`,
      type: 'duplicate_detection',
      column: '_all_',
      severity: dupPercentage > 10 ? 'high' : 'medium',
      title: 'Duplicate Rows Detected',
      description: `Found ${duplicateRowCount} duplicate rows (${dupPercentage.toFixed(1)}% of data)`,
      method: 'drop_duplicates',
      methodOptions: ['drop_duplicates', 'keep_first', 'keep_last'],
      parameters: { keep: 'first' },
      uiConfig: {
        renderAs: 'select',
        options: [
          { value: 'first', label: 'Keep first occurrence' },
          { value: 'last', label: 'Keep last occurrence' },
          { value: 'none', label: 'Remove all duplicates' }
        ],
        default: 'first'
      },
      impact: `Will remove ${duplicateRowCount} rows`,
      rationale: 'Duplicate rows can bias model training and inflate dataset size unnecessarily',
      enabled: true
    });
  }

  // Sort by severity
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4
  };
  suggestions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    duplicateRowCount,
    columnProfiles,
    suggestions
  };
}

// ============================================================================
// Column Profiling
// ============================================================================

function profileColumn(rows: QueryRow[], columnName: string): ColumnProfile {
  const values = rows.map(row => row[columnName]);
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
  
  const totalCount = rows.length;
  const missingCount = totalCount - nonNullValues.length;
  const missingPercentage = (missingCount / totalCount) * 100;
  
  const uniqueSet = new Set(nonNullValues.map(v => String(v)));
  const uniqueCount = uniqueSet.size;
  const uniquePercentage = nonNullValues.length > 0 ? (uniqueCount / nonNullValues.length) * 100 : 0;

  // Infer type
  const inferredType = inferColumnType(nonNullValues);
  
  const profile: ColumnProfile = {
    name: columnName,
    inferredType,
    totalCount,
    missingCount,
    missingPercentage,
    uniqueCount,
    uniquePercentage
  };

  if (inferredType === 'numeric') {
    const numericValues = nonNullValues
      .map(v => typeof v === 'number' ? v : Number(v))
      .filter(v => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (numericValues.length > 0) {
      const n = numericValues.length;
      profile.min = numericValues[0];
      profile.max = numericValues[n - 1];
      profile.mean = numericValues.reduce((a, b) => a + b, 0) / n;
      profile.median = n % 2 === 0 
        ? (numericValues[n/2 - 1] + numericValues[n/2]) / 2 
        : numericValues[Math.floor(n/2)];
      
      // Quartiles
      profile.q1 = percentile(numericValues, 25);
      profile.q3 = percentile(numericValues, 75);
      
      // Standard deviation and skewness
      const variance = numericValues.reduce((acc, v) => acc + (v - profile.mean!) ** 2, 0) / Math.max(1, n - 1);
      profile.stdDev = Math.sqrt(variance);
      
      if (profile.stdDev > 0) {
        profile.skewness = numericValues.reduce((acc, v) => acc + ((v - profile.mean!) / profile.stdDev!) ** 3, 0) / n;
        profile.kurtosis = numericValues.reduce((acc, v) => acc + ((v - profile.mean!) / profile.stdDev!) ** 4, 0) / n - 3;
      } else {
        profile.skewness = 0;
        profile.kurtosis = 0;
      }
      
      // Outlier detection using IQR
      const iqr = profile.q3 - profile.q1;
      const lowerFence = profile.q1 - 1.5 * iqr;
      const upperFence = profile.q3 + 1.5 * iqr;
      profile.outlierCount = numericValues.filter(v => v < lowerFence || v > upperFence).length;
      profile.outlierPercentage = (profile.outlierCount / n) * 100;
    }
  } else if (inferredType === 'categorical' || inferredType === 'text') {
    // Compute top values and entropy
    const valueCounts = new Map<string, number>();
    for (const v of nonNullValues) {
      const str = String(v);
      valueCounts.set(str, (valueCounts.get(str) ?? 0) + 1);
    }
    
    profile.topValues = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));
    
    // Shannon entropy (normalized)
    const total = nonNullValues.length;
    let entropy = 0;
    for (const count of valueCounts.values()) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    const maxEntropy = Math.log2(uniqueCount);
    profile.entropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  return profile;
}

function inferColumnType(values: unknown[]): 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'text' {
  if (values.length === 0) return 'categorical';

  // Check for boolean
  const boolStrings = new Set(['true', 'false', '0', '1', 'yes', 'no', 't', 'f', 'y', 'n']);
  const allBoolean = values.every(v => {
    const str = String(v).toLowerCase().trim();
    return boolStrings.has(str) || typeof v === 'boolean';
  });
  if (allBoolean) return 'boolean';

  // Check for numeric
  const numericCount = values.filter(v => {
    if (typeof v === 'number') return true;
    if (typeof v === 'string') {
      const parsed = Number(v);
      return !Number.isNaN(parsed) && v.trim() !== '';
    }
    return false;
  }).length;
  if (numericCount / values.length >= 0.9) return 'numeric';

  // Check for datetime
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{2}\/\d{2}\/\d{4}/,
    /^\d{4}\/\d{2}\/\d{2}/
  ];
  const dateCount = values.filter(v => {
    const str = String(v);
    return datePatterns.some(p => p.test(str)) || !Number.isNaN(Date.parse(str));
  }).length;
  if (dateCount / values.length >= 0.8) return 'datetime';

  // Check unique percentage for categorical vs text
  const uniqueSet = new Set(values.map(v => String(v)));
  const uniqueRatio = uniqueSet.size / values.length;
  
  // High uniqueness suggests text/ID column
  if (uniqueRatio > 0.9) return 'text';
  
  return 'categorical';
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;
  
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

// ============================================================================
// Suggestion Generation
// ============================================================================

function generateSuggestionsForColumn(
  profile: ColumnProfile, 
  totalRows: number,
  generateId: () => string
): PreprocessingSuggestion[] {
  const suggestions: PreprocessingSuggestion[] = [];

  // 1. Missing Values
  if (profile.missingCount > 0) {
    suggestions.push(generateMissingValueSuggestion(profile, generateId()));
  }

  // 2. Constant/Low Variance Columns
  if (profile.uniqueCount === 1 && profile.missingCount === 0) {
    suggestions.push({
      id: generateId(),
      type: 'constant_column',
      column: profile.name,
      severity: 'medium',
      title: 'Constant Column',
      description: `Column has only one unique value`,
      method: 'drop_column',
      methodOptions: ['drop_column', 'keep'],
      parameters: {},
      uiConfig: {
        renderAs: 'toggle',
        default: true
      },
      impact: 'Removes 1 column with no predictive value',
      rationale: 'Constant columns provide no information for model training',
      enabled: true
    });
  }

  // 3. Numeric-specific suggestions
  if (profile.inferredType === 'numeric') {
    // Outliers
    if (profile.outlierCount && profile.outlierCount > 0 && profile.outlierPercentage! > 1) {
      suggestions.push(generateOutlierSuggestion(profile, generateId()));
    }

    // Skewness
    if (profile.skewness !== undefined && Math.abs(profile.skewness) > 1) {
      suggestions.push(generateSkewnessSuggestion(profile, generateId()));
    }

    // Scaling
    if (profile.stdDev !== undefined && profile.mean !== undefined) {
      suggestions.push(generateScalingSuggestion(profile, generateId()));
    }
  }

  // 4. Categorical-specific suggestions
  if (profile.inferredType === 'categorical') {
    // Encoding
    suggestions.push(generateEncodingSuggestion(profile, totalRows, generateId()));

    // High cardinality
    if (profile.uniqueCount > 50 && profile.uniquePercentage > 10) {
      suggestions.push(generateHighCardinalitySuggestion(profile, generateId()));
    }
  }

  // 5. Type conversion suggestions
  if (profile.inferredType === 'text' && profile.uniqueCount < 20) {
    suggestions.push({
      id: generateId(),
      type: 'type_conversion',
      column: profile.name,
      severity: 'info',
      title: 'Consider as Categorical',
      description: `Text column with only ${profile.uniqueCount} unique values`,
      method: 'convert_to_categorical',
      methodOptions: ['convert_to_categorical', 'keep_as_text'],
      parameters: {},
      uiConfig: {
        renderAs: 'toggle',
        default: false
      },
      impact: 'Enables categorical encoding methods',
      rationale: 'Low cardinality text columns are often categorical features in disguise',
      enabled: false
    });
  }

  return suggestions;
}

function generateMissingValueSuggestion(profile: ColumnProfile, id: string): PreprocessingSuggestion {
  const missingPct = profile.missingPercentage;
  
  // Determine severity based on percentage
  let severity: Severity;
  if (missingPct > 50) severity = 'critical';
  else if (missingPct > 20) severity = 'high';
  else if (missingPct > 5) severity = 'medium';
  else severity = 'low';

  // Choose default method based on column type and missing pattern
  let defaultMethod: string;
  let methodOptions: string[];
  
  if (profile.inferredType === 'numeric') {
    // Use median for skewed data, mean for symmetric
    if (profile.skewness !== undefined && Math.abs(profile.skewness) > 1) {
      defaultMethod = 'median';
    } else {
      defaultMethod = 'mean';
    }
    methodOptions = ['mean', 'median', 'mode', 'constant', 'knn', 'drop_rows'];
    
    // If too much missing, suggest dropping
    if (missingPct > 50) {
      defaultMethod = 'drop_column';
      methodOptions.push('drop_column');
    }
  } else {
    defaultMethod = 'mode';
    methodOptions = ['mode', 'constant', 'drop_rows'];
    if (missingPct > 50) {
      defaultMethod = 'drop_column';
      methodOptions.push('drop_column');
    }
  }

  return {
    id,
    type: 'missing_values',
    column: profile.name,
    severity,
    title: 'Missing Values',
    description: `${profile.missingCount} missing values (${missingPct.toFixed(1)}%)`,
    method: defaultMethod,
    methodOptions,
    parameters: {
      fillValue: profile.inferredType === 'numeric' ? 0 : 'unknown'
    },
    uiConfig: {
      renderAs: 'select',
      options: methodOptions.map(m => ({
        value: m,
        label: getMethodLabel(m)
      })),
      default: defaultMethod
    },
    impact: `Affects ${profile.missingCount} rows (${missingPct.toFixed(1)}% of data)`,
    rationale: getMissingValueRationale(missingPct, profile.inferredType),
    enabled: true
  };
}

function generateOutlierSuggestion(profile: ColumnProfile, id: string): PreprocessingSuggestion {
  const outlierPct = profile.outlierPercentage!;
  
  let severity: Severity;
  if (outlierPct > 10) severity = 'high';
  else if (outlierPct > 5) severity = 'medium';
  else severity = 'low';

  // Determine default method based on outlier percentage
  let defaultMethod: string;
  if (outlierPct > 10) {
    defaultMethod = 'winsorize'; // Cap extreme values
  } else if (outlierPct > 5) {
    defaultMethod = 'clip'; // Clip to IQR bounds
  } else {
    defaultMethod = 'keep'; // May be legitimate
  }

  return {
    id,
    type: 'outliers',
    column: profile.name,
    severity,
    title: 'Outliers Detected',
    description: `${profile.outlierCount} outliers (${outlierPct.toFixed(1)}%) using IQR method`,
    method: defaultMethod,
    methodOptions: ['keep', 'clip', 'winsorize', 'remove', 'log_transform'],
    parameters: {
      threshold: 1.5,
      lowerBound: profile.q1! - 1.5 * (profile.q3! - profile.q1!),
      upperBound: profile.q3! + 1.5 * (profile.q3! - profile.q1!)
    },
    uiConfig: {
      renderAs: 'select',
      options: [
        { value: 'keep', label: 'Keep outliers' },
        { value: 'clip', label: 'Clip to IQR bounds' },
        { value: 'winsorize', label: 'Winsorize (cap at percentiles)' },
        { value: 'remove', label: 'Remove outlier rows' },
        { value: 'log_transform', label: 'Log transform (reduces impact)' }
      ],
      default: defaultMethod
    },
    impact: `Affects ${profile.outlierCount} values (${outlierPct.toFixed(1)}%)`,
    rationale: `Outliers detected using the Interquartile Range (IQR) method. Values outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR] are flagged.`,
    enabled: defaultMethod !== 'keep'
  };
}

function generateSkewnessSuggestion(profile: ColumnProfile, id: string): PreprocessingSuggestion {
  const skewness = profile.skewness!;
  const absSkew = Math.abs(skewness);
  
  let severity: Severity;
  if (absSkew > 2) severity = 'medium';
  else severity = 'low';

  // Choose transform based on skewness direction and magnitude
  let defaultMethod: string;
  if (skewness > 0) {
    // Right-skewed: log or sqrt
    defaultMethod = profile.min !== undefined && profile.min > 0 ? 'log' : 'sqrt';
  } else {
    // Left-skewed: square or reflect+log
    defaultMethod = 'square';
  }

  const skewDirection = skewness > 0 ? 'right' : 'left';

  return {
    id,
    type: 'skewness',
    column: profile.name,
    severity,
    title: 'Skewed Distribution',
    description: `${skewDirection}-skewed distribution (skewness: ${skewness.toFixed(2)})`,
    method: defaultMethod,
    methodOptions: ['keep', 'log', 'sqrt', 'box_cox', 'yeo_johnson', 'square'],
    parameters: {
      skewness
    },
    uiConfig: {
      renderAs: 'select',
      options: [
        { value: 'keep', label: 'Keep original' },
        { value: 'log', label: 'Log transform (for right-skew, positive values)' },
        { value: 'sqrt', label: 'Square root (moderate right-skew)' },
        { value: 'box_cox', label: 'Box-Cox (optimal power transform, positive values)' },
        { value: 'yeo_johnson', label: 'Yeo-Johnson (handles negative values)' },
        { value: 'square', label: 'Square (for left-skew)' }
      ],
      default: defaultMethod
    },
    impact: 'May improve model performance for algorithms assuming normality',
    rationale: `Highly skewed features can negatively impact linear models and distance-based algorithms. Consider transformation if using such models.`,
    enabled: false // Not enabled by default - often depends on the model
  };
}

function generateScalingSuggestion(profile: ColumnProfile, id: string): PreprocessingSuggestion {
  // Determine best scaler based on distribution
  let defaultMethod: string;
  let rationale: string;

  if (profile.outlierCount && profile.outlierPercentage! > 5) {
    defaultMethod = 'robust';
    rationale = 'RobustScaler is recommended due to presence of outliers. It uses median and IQR, making it resilient to extreme values.';
  } else if (profile.skewness !== undefined && Math.abs(profile.skewness) > 1) {
    defaultMethod = 'robust';
    rationale = 'RobustScaler recommended for skewed distribution.';
  } else {
    defaultMethod = 'standard';
    rationale = 'StandardScaler (z-score normalization) is suitable for approximately normal distributions.';
  }

  return {
    id,
    type: 'scaling',
    column: profile.name,
    severity: 'info',
    title: 'Feature Scaling',
    description: `Range: [${profile.min?.toFixed(2)}, ${profile.max?.toFixed(2)}], σ=${profile.stdDev?.toFixed(2)}`,
    method: defaultMethod,
    methodOptions: ['none', 'standard', 'minmax', 'robust', 'maxabs'],
    parameters: {
      min: profile.min,
      max: profile.max,
      mean: profile.mean,
      stdDev: profile.stdDev
    },
    uiConfig: {
      renderAs: 'select',
      options: [
        { value: 'none', label: 'No scaling' },
        { value: 'standard', label: 'StandardScaler (z-score)' },
        { value: 'minmax', label: 'MinMaxScaler (0-1 range)' },
        { value: 'robust', label: 'RobustScaler (median/IQR)' },
        { value: 'maxabs', label: 'MaxAbsScaler (-1 to 1)' }
      ],
      default: defaultMethod
    },
    impact: 'Normalizes feature magnitudes for distance-based algorithms',
    rationale,
    enabled: false // Scaling depends on the algorithm being used
  };
}

function generateEncodingSuggestion(profile: ColumnProfile, totalRows: number, id: string): PreprocessingSuggestion {
  const cardinality = profile.uniqueCount;
  
  // Choose encoding based on cardinality
  let defaultMethod: string;
  let severity: Severity = 'info';
  
  if (cardinality === 2) {
    defaultMethod = 'binary';
  } else if (cardinality <= 10) {
    defaultMethod = 'onehot';
  } else if (cardinality <= 50) {
    defaultMethod = 'target'; // Target encoding for medium cardinality
  } else {
    defaultMethod = 'frequency';
    severity = 'low';
  }

  return {
    id,
    type: 'encoding',
    column: profile.name,
    severity,
    title: 'Categorical Encoding',
    description: `${cardinality} unique categories`,
    method: defaultMethod,
    methodOptions: ['label', 'onehot', 'binary', 'target', 'frequency', 'ordinal'],
    parameters: {
      cardinality
    },
    uiConfig: {
      renderAs: 'select',
      options: [
        { value: 'label', label: 'Label encoding (integer mapping)' },
        { value: 'onehot', label: 'One-hot encoding (binary columns)' },
        { value: 'binary', label: 'Binary encoding (for 2 categories)' },
        { value: 'target', label: 'Target encoding (mean of target)' },
        { value: 'frequency', label: 'Frequency encoding (count-based)' },
        { value: 'ordinal', label: 'Ordinal encoding (ordered categories)' }
      ],
      default: defaultMethod
    },
    impact: cardinality <= 10 
      ? `Creates ${cardinality} binary columns with one-hot` 
      : `Encodes ${cardinality} categories`,
    rationale: getEncodingRationale(cardinality),
    enabled: false
  };
}

function generateHighCardinalitySuggestion(profile: ColumnProfile, id: string): PreprocessingSuggestion {
  return {
    id,
    type: 'high_cardinality',
    column: profile.name,
    severity: 'medium',
    title: 'High Cardinality',
    description: `${profile.uniqueCount} unique values may cause dimensionality issues`,
    method: 'frequency_encoding',
    methodOptions: ['keep', 'frequency_encoding', 'target_encoding', 'group_rare', 'drop_column'],
    parameters: {
      uniqueCount: profile.uniqueCount,
      rareThreshold: 0.01
    },
    uiConfig: {
      renderAs: 'select',
      options: [
        { value: 'keep', label: 'Keep as-is' },
        { value: 'frequency_encoding', label: 'Frequency encoding' },
        { value: 'target_encoding', label: 'Target encoding' },
        { value: 'group_rare', label: 'Group rare categories (<1%)' },
        { value: 'drop_column', label: 'Drop column' }
      ],
      default: 'frequency_encoding'
    },
    impact: `High cardinality can cause memory issues with one-hot encoding`,
    rationale: 'Columns with many unique values can explode dimensionality with one-hot encoding. Consider alternative encoding strategies.',
    enabled: true
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    mean: 'Mean imputation',
    median: 'Median imputation',
    mode: 'Mode (most frequent) imputation',
    constant: 'Fill with constant value',
    knn: 'K-Nearest Neighbors imputation',
    drop_rows: 'Drop rows with missing values',
    drop_column: 'Drop entire column'
  };
  return labels[method] ?? method;
}

function getMissingValueRationale(missingPct: number, dataType: string): string {
  if (missingPct > 50) {
    return 'Over 50% missing data suggests this column may not be reliable. Consider dropping unless domain knowledge indicates importance.';
  }
  if (missingPct > 20) {
    return 'Significant missing data. Simple imputation may introduce bias. Consider KNN or model-based imputation for important features.';
  }
  if (dataType === 'numeric') {
    return 'For numeric data, median imputation is robust to outliers. Mean is suitable for symmetric distributions.';
  }
  return 'For categorical data, mode imputation preserves the most common category. Consider if "missing" should be its own category.';
}

function getEncodingRationale(cardinality: number): string {
  if (cardinality === 2) {
    return 'Binary feature: simple 0/1 encoding is most efficient.';
  }
  if (cardinality <= 10) {
    return 'Low cardinality: one-hot encoding works well and preserves category relationships.';
  }
  if (cardinality <= 50) {
    return 'Medium cardinality: target encoding can capture predictive signal without dimensionality explosion.';
  }
  return 'High cardinality: frequency or target encoding recommended to avoid memory issues with one-hot encoding.';
}





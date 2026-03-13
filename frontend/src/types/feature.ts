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

// ----------------------------------------------------------------------------
// FE V2 (Notebook-first) UI state types
// ----------------------------------------------------------------------------

export type PipelineStatus = 'draft' | 'approved' | 'deprecated';

export interface DataChangeSummary {
  addedColumns: string[];
  removedColumns: string[];
  renamedColumns: { oldName: string; newName: string }[];
  typeChanges: { column: string; oldType: string; newType: string }[];
  nullDeltas: { column: string; oldNullCount: number; newNullCount: number }[];
  warnings: string[];
}

export interface TransformationStep {
  id: string;
  name: string;
  rationale: string;
  codeReference?: string;
  method?: FeatureMethod;
  columns?: string[];
}

export interface ReadinessReport {
  dataSummary: DataChangeSummary;
  steps: TransformationStep[];
}

export interface PipelineVersion {
  id: string;
  projectId: string;
  name: string;
  status: PipelineStatus;
  createdAt: string;
  approvedAt?: string;
  readinessReport: ReadinessReport;
}


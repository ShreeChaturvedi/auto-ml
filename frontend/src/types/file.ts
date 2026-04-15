/**
 * File type definitions for data upload and management
 *
 * Supports various file types:
 * - Structured data: CSV, JSON, Excel
 * - Documents: PDF, Markdown, TXT, DOCX, and common text formats
 * - Note: Images are NOT supported for upload
 */

import type { NlQueryExplanation } from '@/lib/api/query';

export type FileType =
  | 'csv'
  | 'json'
  | 'excel'
  | 'pdf'
  | 'markdown'
  | 'word'
  | 'text'
  | 'other';

export type ColumnDataType = 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'unknown';

export interface UploadedFile {
  id: string;
  name: string;
  type: FileType;
  size: number; // in bytes
  uploadedAt: Date;
  projectId: string;
  file?: File; // Original File object for processing (not available when hydrated from backend)
  previewUrl?: string; // For images and PDFs
  metadata?: FileMetadata;
}

/**
 * File metadata for different types
 */
export interface FileMetadata {
  // CSV/JSON/Excel specific
  rowCount?: number;
  columnCount?: number;
  columns?: string[];
  datasetId?: string;
  tableName?: string; // User-facing SQL table name
  queryable?: boolean;
  queryError?: string;
  datasetProfile?: {
    nRows: number;
    nCols: number;
    dtypes: Record<string, ColumnDataType>;
    nullCounts: Record<string, number>;
  };

  // Document specific
  documentId?: string;
  chunkCount?: number;
  embeddingDimension?: number;
  parseWarning?: string;

  // PDF specific
  pageCount?: number;

  // Image specific
  dimensions?: {
    width: number;
    height: number;
  };

  // Derived dataset lineage
  derivedFrom?: string;

  // General
  mimeType?: string;
  encoding?: string;
}

/**
 * Data preview for tabular files
 */
export interface DataPreview {
  fileId: string;
  headers: string[];
  rows: Record<string, unknown>[]; // Array of row objects
  totalRows: number;
  previewRows: number; // Number of rows in preview
  statistics?: ColumnStatistics[];
  eda?: EdaSummary;
  columnTypes?: Record<string, ColumnDataType>; // Column types from query results
}

/**
 * Column statistics for data exploration
 */
export interface ColumnStatistics {
  columnName: string;
  dataType: 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'text';
  uniqueValues: number;
  missingValues: number;
  missingPercentage: number;

  // Numeric stats
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  std?: number;

  // Categorical stats
  topValues?: Array<{ value: string; count: number }>;

  // Datetime stats
  minDate?: Date;
  maxDate?: Date;
}

/**
 * Query mode for data viewer
 */
export type QueryMode = 'english' | 'sql';

/**
 * EDA scope — describes the origin and extent of an EDA analysis.
 */
export interface EdaScope {
  source: 'dataset-profile' | 'query-result';
  rowsAnalyzed: number;
  totalRows: number;
}

/**
 * EDA Summary types (from backend query API)
 */
export interface EdaSummary {
  scope?: EdaScope;
  numericColumns: NumericColumnSummary[];
  categoricalColumns: CategoricalColumnSummary[];
  dataQuality: DataQualitySummary[];
  histogram?: HistogramData;
  histograms?: HistogramData[];    // all numeric columns (up to 20)
  scatter?: ScatterData;
  correlations?: CorrelationData[];
  scatterPairs?: ScatterPairData[];
  missingMatrix?: { columns: string[]; matrix: number[][] };
}

export interface NumericColumnSummary {
  column: string;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  skewness: number;
  q1: number;
  q3: number;
  outlierCount: number;
}

export interface CategoricalColumnSummary {
  column: string;
  uniqueCount: number;
  topValues: Array<{ value: string; count: number; percentage: number }>;
  missingCount: number;
  mode: string | null;
}

export interface DataQualitySummary {
  column: string;
  dataType: 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'mixed';
  totalCount: number;
  missingCount: number;
  missingPercentage: number;
  uniqueCount: number;
  uniquePercentage: number;
}

export interface HistogramData {
  column: string;
  buckets: Array<{ start: number; end: number; count: number }>;
}

export interface ScatterData {
  xColumn: string;
  yColumn: string;
  points: Array<{ x: number; y: number }>;
}

export interface RegressionLine {
  slope: number;
  intercept: number;
  r2: number;
}

export interface ScatterPairData {
  xColumn: string;
  yColumn: string;
  points: Array<{ x: number; y: number }>;
  regressionLine?: RegressionLine;
}

export interface CorrelationData {
  columnA: string;
  columnB: string;
  coefficient: number;
}

/**
 * Query artifact - represents a saved query result
 * Similar to a browser tab or Jupyter notebook cell
 */
export interface QueryArtifact {
  id: string;
  name: string; // Display name (auto-generated or custom)
  query: string; // The actual query text
  mode: QueryMode;
  result: DataPreview;
  timestamp: Date;
  isSaved: boolean; // Whether saved to backend (future feature)
  projectId: string;
  // EDA metadata from backend
  eda?: EdaSummary;
  cached?: boolean;
  executionMs?: number;
  cacheTimestamp?: string;
  generatedSql?: string; // For NL queries
  rationale?: string; // For NL queries
  explanation?: NlQueryExplanation; // Structured explanation (includes confidence mode/tier for NL review UX)
}

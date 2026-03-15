export interface QueryColumn {
  name: string;
  dataTypeID?: number;
  dataType?: string;
}

export interface QueryRow {
  [key: string]: unknown;
}

export interface QueryResultPayload {
  queryId: string;
  sql: string;
  columns: QueryColumn[];
  rows: QueryRow[];
  rowCount: number;
  executionMs: number;
  cached: boolean;
  cacheTimestamp?: string;
  eda?: EdaSummary;
}

export interface EdaSummary {
  numericColumns: NumericSummary[];
  categoricalColumns: CategoricalSummary[];
  dataQuality: DataQualitySummary[];
  histogram?: HistogramSummary;       // keep for backward compat
  histograms?: HistogramSummary[];    // all numeric columns (up to 20)
  scatter?: ScatterSummary;
  correlations?: CorrelationSummary[];
  scatterPairs?: ScatterPairData[];
}

export interface NumericSummary {
  column: string;
  min: number;
  max: number;
  mean: number;
  median?: number;
  stdDev: number;
  skewness?: number;
  q1?: number;
  q3?: number;
  outlierCount?: number;
}

export interface CategoricalSummary {
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

export interface HistogramSummary {
  column: string;
  buckets: Array<{
    start: number;
    end: number;
    count: number;
  }>;
}

export interface ScatterSummary {
  xColumn: string;
  yColumn: string;
  points: Array<{ x: number; y: number }>;
}

export interface CorrelationSummary {
  columnA: string;
  columnB: string;
  coefficient: number;
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

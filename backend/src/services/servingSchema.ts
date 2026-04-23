import type { ColumnDataType, DatasetProfile } from '../types/dataset.js';
import type { ModelRecord } from '../types/model.js';

export type ServingFeatureType = 'float' | 'int' | 'str';

export type ServingSchemaDerivationSuccess = {
  ok: true;
  featureColumns: string[];
  featureTypes: Record<string, ServingFeatureType>;
  sampleRequest: Record<string, unknown>;
};

export type ServingSchemaDerivationFailure = {
  ok: false;
  error: string;
};

export type ServingSchemaDerivationResult =
  | ServingSchemaDerivationSuccess
  | ServingSchemaDerivationFailure;

function toServingFeatureType(dtype: ColumnDataType | undefined): ServingFeatureType {
  switch (dtype) {
    case 'float':
      return 'float';
    case 'integer':
    case 'boolean':
      return 'int';
    default:
      return 'str';
  }
}

function defaultSampleValue(featureType: ServingFeatureType): unknown {
  return featureType === 'str' ? '' : 0;
}

function normalizeFeatureColumns(featureColumns: string[] | undefined): string[] {
  if (!Array.isArray(featureColumns)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of featureColumns) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeSampleValue(value: unknown, featureType: ServingFeatureType): unknown {
  if (value == null) {
    return defaultSampleValue(featureType);
  }

  if (featureType === 'str') {
    return value instanceof Date ? value.toISOString() : String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return featureType === 'int' ? Math.trunc(value) : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return defaultSampleValue(featureType);
    }
    const parsed = featureType === 'int'
      ? Number.parseInt(trimmed, 10)
      : Number.parseFloat(trimmed);
    if (Number.isFinite(parsed)) {
      return featureType === 'int' ? Math.trunc(parsed) : parsed;
    }
    return defaultSampleValue(featureType);
  }

  return defaultSampleValue(featureType);
}

export function deriveServingSchema(
  dataset: DatasetProfile,
  targetColumn: string | undefined,
  preferredFeatureColumns?: string[],
): ServingSchemaDerivationResult {
  const datasetColumnsByName = new Map(dataset.columns.map((column) => [column.name, column]));
  const normalizedPreferred = normalizeFeatureColumns(preferredFeatureColumns);
  const candidateColumns = normalizedPreferred.length > 0
    ? normalizedPreferred
    : dataset.columns
        .map((column) => column.name)
        .filter((column) => column !== targetColumn);

  const featureColumns = candidateColumns.filter(
    (column) => column !== targetColumn && datasetColumnsByName.has(column),
  );

  if (featureColumns.length === 0) {
    if (normalizedPreferred.length > 0) {
      return {
        ok: false,
        error: `Unable to derive serving schema: none of the requested feature columns are present in dataset "${dataset.datasetId}".`,
      };
    }
    const targetSuffix = targetColumn ? ` after excluding target column "${targetColumn}"` : '';
    return {
      ok: false,
      error: `Unable to derive serving schema: dataset "${dataset.datasetId}" has no usable feature columns${targetSuffix}.`,
    };
  }

  const sampleRow = dataset.sample.find((row) => featureColumns.every((column) => column in row))
    ?? dataset.sample[0]
    ?? {};

  const featureTypes = Object.fromEntries(
    featureColumns.map((column) => [column, toServingFeatureType(datasetColumnsByName.get(column)?.dtype)]),
  ) as Record<string, ServingFeatureType>;

  const sampleRequest = Object.fromEntries(
    featureColumns.map((column) => [
      column,
      normalizeSampleValue(sampleRow[column], featureTypes[column]),
    ]),
  );

  return {
    ok: true,
    featureColumns,
    featureTypes,
    sampleRequest,
  };
}

export function hasCompleteServingSchema(
  model: Pick<ModelRecord, 'featureColumns' | 'featureTypes' | 'sampleRequest'>,
): boolean {
  const featureColumns = normalizeFeatureColumns(model.featureColumns);
  const featureTypes = model.featureTypes ?? {};
  const sampleRequest = model.sampleRequest ?? {};

  return featureColumns.length > 0
    && featureColumns.every((column) => column in featureTypes)
    && featureColumns.every((column) => column in sampleRequest);
}

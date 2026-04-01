import { hasDatabaseConfiguration } from '../../db.js';
import { resolveDatasetSqlName } from '../../services/datasetSqlNames.js';
import type { DatasetProfile } from '../../types/dataset.js';

interface DatasetResponseOptions {
  physicalTableName: string;
  warning?: string;
  eda?: unknown;
  queryable?: boolean;
}

export function buildDatasetResponse(
  dataset: DatasetProfile,
  { physicalTableName, warning, eda, queryable = hasDatabaseConfiguration() && !warning }: DatasetResponseOptions,
) {
  return {
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    fileType: dataset.fileType,
    size: dataset.size,
    n_rows: dataset.nRows,
    n_cols: dataset.nCols,
    columns: dataset.columns.map((column) => column.name),
    dtypes: Object.fromEntries(dataset.columns.map((column) => [column.name, column.dtype])),
    null_counts: Object.fromEntries(dataset.columns.map((column) => [column.name, column.nullCount])),
    sample: dataset.sample,
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
    tableName: resolveDatasetSqlName(dataset),
    physicalTableName,
    eda,
    warning,
    queryable,
  };
}

import {
  getMockBusinessDataset,
  getMockBusinessDocument,
  getMockBusinessRows,
  getMockBusinessRowsPage,
  listMockBusinessDatasets,
  listMockBusinessDocuments,
  type InferredDtype,
  type MockBusinessDataset as SharedMockBusinessDataset,
  type MockBusinessDocument as SharedMockBusinessDocument,
} from "./mockBusinessFixtures";

type ColumnDataType =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "unknown";

type DatasetColumnProfile = {
  name: string;
  dtype: ColumnDataType;
  nullCount: number;
};

type MockBusinessDataset = {
  datasetId: string;
  filename: string;
  tableName: string;
  filePath: string;
  byteSize: number;
  nRows: number;
  nCols: number;
  headers: string[];
  columns: DatasetColumnProfile[];
  dtypes: Record<string, ColumnDataType>;
  nullCounts: Record<string, number>;
  sample: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
};

type MockBusinessDocument = {
  documentId: string;
  filename: string;
  filePath: string;
  mimeType: string;
  byteSize: number;
  chunkCount: number;
  embeddingDimension: number;
  createdAt: string;
};

type MockBusinessFixtureStore = {
  datasets: MockBusinessDataset[];
  documents: MockBusinessDocument[];
  getDatasetById: (datasetId: string) => MockBusinessDataset | undefined;
  getDatasetByFilename: (filename: string) => MockBusinessDataset | undefined;
  getDocumentByFilename: (filename: string) => MockBusinessDocument | undefined;
  getRows: (
    datasetId: string,
    options?: { offset?: number; limit?: number },
  ) => {
    rows: Record<string, unknown>[];
    columns: string[];
    rowCount: number;
    offset: number;
    limit: number;
  };
};

const FIXTURE_CREATED_AT = "2026-04-16T14:00:00.000Z";

let cachedStore: MockBusinessFixtureStore | null = null;

export function getMockBusinessFixtureStore(): MockBusinessFixtureStore {
  if (cachedStore) {
    return cachedStore;
  }

  const datasets = listMockBusinessDatasets().map(toLegacyDataset);
  const documents = listMockBusinessDocuments().map(toLegacyDocument);

  cachedStore = {
    datasets,
    documents,
    getDatasetById(datasetId) {
      const dataset = getMockBusinessDataset(datasetId);
      return dataset.assetKind === "raw" ? toLegacyDataset(dataset) : undefined;
    },
    getDatasetByFilename(filename) {
      const dataset = listMockBusinessDatasets().find((entry) => entry.filename === filename);
      return dataset ? toLegacyDataset(dataset) : undefined;
    },
    getDocumentByFilename(filename) {
      const document = listMockBusinessDocuments().find(
        (entry) => entry.filename === filename,
      );
      return document ? toLegacyDocument(document) : undefined;
    },
    getRows(datasetId, options = {}) {
      const offset = Math.max(0, options.offset ?? 0);
      const limit = Math.max(1, options.limit ?? 100);
      const page = Math.floor(offset / limit) + 1;
      const result = getMockBusinessRowsPage(datasetId, { page, pageSize: limit });
      const dataset = getMockBusinessDataset(datasetId);

      return {
        rows: result.rows.map((row) => ({ ...row })),
        columns: [...dataset.columns],
        rowCount: result.totalRows,
        offset,
        limit,
      };
    },
  };

  return cachedStore;
}

function toLegacyDataset(dataset: SharedMockBusinessDataset): MockBusinessDataset {
  const rows = getMockBusinessRows(dataset.datasetId);

  return {
    datasetId: dataset.datasetId,
    filename: dataset.filename,
    tableName: dataset.tableName,
    filePath: dataset.filePath,
    byteSize: dataset.byteSize,
    nRows: dataset.rows,
    nCols: dataset.cols,
    headers: [...dataset.columns],
    columns: dataset.columnProfiles.map((column) => ({
      name: column.columnName,
      dtype: mapDtype(column.dtype),
      nullCount: column.nullCount,
    })),
    dtypes: Object.fromEntries(
      Object.entries(dataset.dtypes).map(([key, value]) => [key, mapDtype(value)]),
    ),
    nullCounts: { ...dataset.nullCounts },
    sample: dataset.sampleRows.map((row) => ({ ...row })),
    rows: rows.map((row) => ({ ...row })),
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
  };
}

function toLegacyDocument(document: SharedMockBusinessDocument): MockBusinessDocument {
  const shared = getMockBusinessDocument(document.documentId);
  return {
    documentId: shared.documentId,
    filename: shared.filename,
    filePath: shared.filePath,
    mimeType: shared.mimeType,
    byteSize: shared.byteSize,
    chunkCount: 24,
    embeddingDimension: 3072,
    createdAt: FIXTURE_CREATED_AT,
  };
}

function mapDtype(dtype: InferredDtype): ColumnDataType {
  switch (dtype) {
    case "boolean":
      return "boolean";
    case "integer":
      return "integer";
    case "float":
      return "float";
    case "date":
    case "datetime":
      return "date";
    case "string":
      return "string";
    default:
      return "unknown";
  }
}

export type {
  ColumnDataType,
  MockBusinessDataset,
  MockBusinessDocument,
  MockBusinessFixtureStore,
};

import { extname } from 'node:path';

import { z } from 'zod';

import type { ColumnDataType, DatasetFileType } from '../../types/dataset.js';

export const datasetUploadSchema = z.object({
  projectId: z.string().optional()
});

const COLUMN_DATA_TYPES: [ColumnDataType, ...ColumnDataType[]] = [
  'string',
  'integer',
  'float',
  'boolean',
  'date',
  'unknown'
];

export const updateColumnTypeSchema = z.object({
  dtype: z.enum(COLUMN_DATA_TYPES)
});

export const SUPPORTED_EXTENSIONS: Record<string, DatasetFileType> = {
  '.csv': 'csv',
  '.json': 'json',
  '.xlsx': 'xlsx'
};

export const SUPPORTED_MIME_TYPES: Partial<Record<string, DatasetFileType>> = {
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'csv',
  'application/csv': 'csv',
  'application/json': 'json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};

export function detectFileType(filename: string, mimetype?: string): DatasetFileType | undefined {
  const extension = extname(filename).toLowerCase();
  const extensionType = SUPPORTED_EXTENSIONS[extension];
  if (extensionType) {
    return extensionType;
  }
  if (mimetype && SUPPORTED_MIME_TYPES[mimetype]) {
    return SUPPORTED_MIME_TYPES[mimetype];
  }
  return undefined;
}

export function legacySpreadsheetError(filename: string): string | undefined {
  if (extname(filename).toLowerCase() === '.xls') {
    return 'Legacy .xls spreadsheets are no longer supported. Please convert the file to .xlsx or .csv and upload it again.';
  }
  return undefined;
}

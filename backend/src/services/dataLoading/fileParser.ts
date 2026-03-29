/**
 * File Parser - CSV/JSON/XLSX parsing logic for dataset loading
 */

import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

import { appLogger } from '../../logging/logger.js';

import { sanitizeDatasetRows } from './sanitization.js';

const LEGACY_XLS_ERROR =
  'Legacy .xls spreadsheets are no longer supported. Please convert the file to .xlsx or .csv and upload it again.';

function assertSupportedSpreadsheetFilename(filename?: string) {
  if (filename?.toLowerCase().endsWith('.xls')) {
    throw new Error(LEGACY_XLS_ERROR);
  }
}

function normalizeSpreadsheetCell(value: ExcelJS.CellValue | undefined): unknown {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeSpreadsheetCell(entry));
  }
  if (typeof value === 'object') {
    if ('result' in value) {
      return normalizeSpreadsheetCell(value.result);
    }
    if ('text' in value) {
      return value.text;
    }
    if ('hyperlink' in value) {
      const text = 'text' in value ? value.text : undefined;
      return text ?? value.hyperlink ?? null;
    }
    if ('richText' in value) {
      return value.richText.map((entry) => entry.text).join('');
    }
    if ('error' in value) {
      return value.error;
    }
  }
  return String(value);
}

function stringifySpreadsheetCell(value: ExcelJS.CellValue | undefined): string {
  const normalized = normalizeSpreadsheetCell(value);
  return normalized === null || normalized === undefined ? '' : String(normalized);
}

function toExcelWorkbookBuffer(buffer: Buffer): ArrayBuffer {
  const slicedBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return slicedBuffer instanceof ArrayBuffer
    ? slicedBuffer
    : Uint8Array.from(buffer).buffer;
}

function getSpreadsheetRowValues(row: ExcelJS.Row): ExcelJS.CellValue[] {
  if (Array.isArray(row.values)) {
    return row.values.slice(1);
  }

  return Object.entries(row.values)
    .filter(([key]) => key !== '0')
    .sort(([leftKey], [rightKey]) => Number(leftKey) - Number(rightKey))
    .map(([, value]) => value);
}

function extractWorksheetRows(workbook: ExcelJS.Workbook): Record<string, unknown>[] {
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const headerRow = worksheet.getRow(1);
  const headerValues = getSpreadsheetRowValues(headerRow);
  const headers: string[] = headerValues.map((value, index) => {
    const header = stringifySpreadsheetCell(value).trim();
    return header || `column_${index + 1}`;
  });

  if (!headers.length) {
    return [];
  }

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const record: Record<string, unknown> = {};
    let hasValue = false;

    headers.forEach((header, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      const value = normalizeSpreadsheetCell(cell.value);
      if (value !== null && value !== undefined && value !== '') {
        hasValue = true;
      }
      record[header] = value;
    });

    if (hasValue) {
      rows.push(record);
    }
  });

  return sanitizeDatasetRows(rows);
}

export interface XlsxSampleResult {
  sampleRows: Record<string, unknown>[];
  totalRowCount: number;
  headers: string[];
}

/**
 * Stream an xlsx file, collecting the first `maxRows` for profiling/EDA and
 * counting the total.  Uses the ExcelJS streaming reader so neither the full
 * workbook XML nor all row objects are ever held in memory at once.
 */
export async function parseXlsxSample(
  filePath: string,
  filename?: string,
  maxRows = 5000
): Promise<XlsxSampleResult> {
  assertSupportedSpreadsheetFilename(filename);

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit',
    sharedStrings: 'cache',
    worksheets: 'emit'
  });

  let headers: string[] = [];
  const sampleRows: Record<string, unknown>[] = [];
  let totalRowCount = 0;
  let processedFirstSheet = false;

  for await (const worksheetReader of workbookReader) {
    if (processedFirstSheet) break;
    processedFirstSheet = true;

    for await (const row of worksheetReader) {
      if (row.number === 1) {
        const rawValues: ExcelJS.CellValue[] = Array.isArray(row.values)
          ? (row.values as ExcelJS.CellValue[]).slice(1)
          : [];
        headers = rawValues.map((value, index) => {
          const header = stringifySpreadsheetCell(value).trim();
          return header || `column_${index + 1}`;
        });
        continue;
      }

      if (!headers.length) continue;

      const record = buildRowRecord(row, headers);
      if (!record) continue;

      totalRowCount++;
      if (sampleRows.length < maxRows) {
        sampleRows.push(record);
      }
    }
  }

  return {
    sampleRows: sanitizeDatasetRows(sampleRows),
    totalRowCount,
    headers
  };
}

/**
 * Stream an xlsx file and call `onBatch` for every N rows.
 * Used for Postgres insertion so rows are never all in memory at once.
 */
export async function streamXlsxRows(
  filePath: string,
  filename: string | undefined,
  onBatch: (batch: Record<string, unknown>[]) => Promise<void>,
  batchSize = 5000
): Promise<number> {
  assertSupportedSpreadsheetFilename(filename);

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit',
    sharedStrings: 'cache',
    worksheets: 'emit'
  });

  let headers: string[] = [];
  let batch: Record<string, unknown>[] = [];
  let totalRows = 0;
  let processedFirstSheet = false;

  for await (const worksheetReader of workbookReader) {
    if (processedFirstSheet) break;
    processedFirstSheet = true;

    for await (const row of worksheetReader) {
      if (row.number === 1) {
        const rawValues: ExcelJS.CellValue[] = Array.isArray(row.values)
          ? (row.values as ExcelJS.CellValue[]).slice(1)
          : [];
        headers = rawValues.map((value, index) => {
          const header = stringifySpreadsheetCell(value).trim();
          return header || `column_${index + 1}`;
        });
        continue;
      }

      if (!headers.length) continue;

      const record = buildRowRecord(row, headers);
      if (!record) continue;

      batch.push(record);
      totalRows++;

      if (batch.length >= batchSize) {
        await onBatch(sanitizeDatasetRows(batch));
        batch = [];
      }
    }
  }

  if (batch.length > 0) {
    await onBatch(sanitizeDatasetRows(batch));
  }

  return totalRows;
}

/**
 * Single-pass xlsx streaming: collects a sample AND feeds remaining rows to
 * a batch callback — all in one pass through the file.
 *
 * 1. First `sampleSize` rows are collected into memory and returned.
 * 2. Once the sample is full, `onSampleReady(sample)` is called so the
 *    caller can profile columns and create the PG table.
 * 3. The sample rows are then flushed via `onBatch`, followed by all
 *    remaining rows in `batchSize` chunks.
 *
 * This halves processing time vs. the two-pass approach.
 */
export async function streamXlsxSinglePass(
  filePath: string,
  filename: string | undefined,
  callbacks: {
    sampleSize: number;
    batchSize: number;
    onSampleReady: (sample: Record<string, unknown>[]) => Promise<void>;
    onBatch: (batch: Record<string, unknown>[]) => Promise<void>;
  }
): Promise<{ totalRowCount: number; sampleRows: Record<string, unknown>[] }> {
  assertSupportedSpreadsheetFilename(filename);

  const { sampleSize, batchSize, onSampleReady, onBatch } = callbacks;

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit',
    sharedStrings: 'cache',
    worksheets: 'emit'
  });

  let headers: string[] = [];
  const sampleRows: Record<string, unknown>[] = [];
  let sampleFlushed = false;
  let batch: Record<string, unknown>[] = [];
  let totalRowCount = 0;
  let processedFirstSheet = false;

  for await (const worksheetReader of workbookReader) {
    if (processedFirstSheet) break;
    processedFirstSheet = true;

    for await (const row of worksheetReader) {
      if (row.number === 1) {
        const rawValues: ExcelJS.CellValue[] = Array.isArray(row.values)
          ? (row.values as ExcelJS.CellValue[]).slice(1)
          : [];
        headers = rawValues.map((value, index) => {
          const header = stringifySpreadsheetCell(value).trim();
          return header || `column_${index + 1}`;
        });
        continue;
      }

      if (!headers.length) continue;

      const record = buildRowRecord(row, headers);
      if (!record) continue;

      totalRowCount++;

      // Phase 1: collect sample
      if (!sampleFlushed) {
        sampleRows.push(record);

        if (sampleRows.length >= sampleSize) {
          // Sample complete — let caller profile + create PG table
          const sanitized = sanitizeDatasetRows(sampleRows);
          sampleRows.length = 0;
          sampleRows.push(...sanitized);
          await onSampleReady(sampleRows);
          // Flush sample as the first batch
          await onBatch(sampleRows);
          sampleFlushed = true;
        }
        continue;
      }

      // Phase 2: stream remaining rows in batches
      batch.push(record);
      if (batch.length >= batchSize) {
        await onBatch(sanitizeDatasetRows(batch));
        batch = [];
      }
    }
  }

  // Handle case where file has fewer rows than sampleSize
  if (!sampleFlushed && sampleRows.length > 0) {
    const sanitized = sanitizeDatasetRows(sampleRows);
    sampleRows.length = 0;
    sampleRows.push(...sanitized);
    await onSampleReady(sampleRows);
    await onBatch(sampleRows);
  }

  // Flush remaining rows
  if (batch.length > 0) {
    await onBatch(sanitizeDatasetRows(batch));
  }

  return { totalRowCount, sampleRows };
}

function buildRowRecord(
  row: ExcelJS.Row,
  headers: string[]
): Record<string, unknown> | null {
  const record: Record<string, unknown> = {};
  let hasValue = false;

  headers.forEach((header, columnIndex) => {
    const cell = row.getCell(columnIndex + 1);
    const value = normalizeSpreadsheetCell(cell.value);
    if (value !== null && value !== undefined && value !== '') {
      hasValue = true;
    }
    record[header] = value;
  });

  return hasValue ? record : null;
}

/** @deprecated Use parseXlsxSample + streamXlsxRows for large files */
export async function parseXlsxFromFile(
  filePath: string,
  filename?: string
): Promise<Record<string, unknown>[]> {
  const { sampleRows } = await parseXlsxSample(filePath, filename, Infinity);
  return sampleRows;
}

export async function parseDatasetRows(
  buffer: Buffer,
  fileType: 'csv' | 'json' | 'xlsx',
  filename?: string
): Promise<Record<string, unknown>[]> {
  switch (fileType) {
    case 'csv': {
      const text = buffer.toString('utf8');
      const rows = parseCsv(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }) as Record<string, unknown>[];
      return sanitizeDatasetRows(rows);
    }
    case 'json': {
      const text = buffer.toString('utf8');
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const rows = parsed.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[];
          return sanitizeDatasetRows(rows);
        }
        if (typeof parsed === 'object' && parsed !== null) {
          return sanitizeDatasetRows([parsed as Record<string, unknown>]);
        }
        throw new Error('JSON dataset must be an object or array of objects');
      } catch (error) {
        // Attempt to parse as NDJSON
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const rows: Record<string, unknown>[] = [];
        for (const line of lines) {
          try {
            const value = JSON.parse(line);
            if (typeof value === 'object' && value !== null) {
              rows.push(value as Record<string, unknown>);
            }
          } catch {
            appLogger.warn('[datasetLoader] Skipping invalid JSON line');
          }
        }
        if (rows.length > 0) {
          return sanitizeDatasetRows(rows);
        }
        throw error;
      }
    }
    case 'xlsx': {
      assertSupportedSpreadsheetFilename(filename);
      const workbook = new ExcelJS.Workbook();
      const workbookBuffer = toExcelWorkbookBuffer(buffer);
      void (await workbook.xlsx.load(workbookBuffer));
      return extractWorksheetRows(workbook);
    }
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

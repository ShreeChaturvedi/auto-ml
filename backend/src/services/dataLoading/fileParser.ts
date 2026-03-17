/**
 * File Parser - CSV/JSON/XLSX parsing logic for dataset loading
 */

import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

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
            console.warn('[datasetLoader] Skipping invalid JSON line');
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
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

import { describe, it, expect } from 'vitest';

import { normalizeValueForColumn, parseDatasetRows, sanitizeTableName } from './datasetLoader.js';

describe('datasetLoader', () => {
  describe('sanitizeTableName', () => {
    it('creates a clean table name without suffix by default', () => {
      const tableName = sanitizeTableName(
        'my data file.csv',
        '123e4567-e89b-12d3-a456-426614174000'
      );

      expect(tableName).toBe('my_data_file');
      expect(tableName.length).toBeLessThanOrEqual(63);
    });

    it('can add a dataset suffix when forced unique', () => {
      const tableName = sanitizeTableName(
        'my data file.csv',
        '123e4567-e89b-12d3-a456-426614174000',
        true
      );

      expect(tableName).toMatch(/^my_data_file_[a-z0-9]{8}$/);
      expect(tableName.length).toBeLessThanOrEqual(63);
    });

    it('falls back when filename is empty', () => {
      const tableName = sanitizeTableName('.csv', 'abc123');
      expect(tableName.startsWith('table_data')).toBe(true);
    });
  });

  describe('parseDatasetRows', () => {
    it('parses CSV rows', async () => {
      const rows = await parseDatasetRows(
        Buffer.from('id,name\n1,A\n2,B'),
        'csv'
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: '1', name: 'A' });
    });

    it('parses JSON arrays', async () => {
      const rows = await parseDatasetRows(
        Buffer.from(JSON.stringify([{ id: 1 }, { id: 2 }])),
        'json'
      );

      expect(rows).toHaveLength(2);
      expect(rows[1]).toEqual({ id: 2 });
    });

    it('parses NDJSON payloads', async () => {
      const rows = await parseDatasetRows(
        Buffer.from('{"id": 1}\n{"id": 2}\n'),
        'json'
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: 1 });
    });

    it('sanitizes null bytes from parsed string fields', async () => {
      const rows = await parseDatasetRows(
        Buffer.from('id,name\n1,bad\u0000name'),
        'csv'
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ id: '1', name: 'badname' });
    });

    it('sanitizes unsupported unicode escapes from JSON payloads', async () => {
      const rows = await parseDatasetRows(
        Buffer.from('{"id": 1, "name": "\\ud800"}'),
        'json'
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(1);
      expect(rows[0].name).toBe('\uFFFD');
    });

    it('repairs legacy quoted semicolon-collapsed workbook csv rows', async () => {
      const rows = await parseDatasetRows(
        Buffer.from(
          '"age;job;marital;balance"\n'
          + '"58;""management"";""married"";2143"\n'
          + '"44;""technician"";""single"";29"\n'
        ),
        'csv',
        'bank-full_processed_workbook_1.csv'
      );

      expect(rows).toEqual([
        { age: '58', job: 'management', marital: 'married', balance: '2143' },
        { age: '44', job: 'technician', marital: 'single', balance: '29' }
      ]);
    });

    it('parses XLSX rows', async () => {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');
      worksheet.addRow(['id', 'name', 'active']);
      worksheet.addRow([1, 'Ada', true]);
      worksheet.addRow([2, 'Grace', false]);

      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const rows = await parseDatasetRows(buffer, 'xlsx', 'people.xlsx');

      expect(rows).toEqual([
        { id: 1, name: 'Ada', active: true },
        { id: 2, name: 'Grace', active: false }
      ]);
    });

    it('rejects legacy XLS spreadsheets with guidance', async () => {
      await expect(parseDatasetRows(Buffer.from('placeholder'), 'xlsx', 'legacy.xls')).rejects.toThrow(
        /no longer supported/i
      );
    });
  });

  describe('normalizeValueForColumn', () => {
    it('coerces invalid date strings to null', () => {
      expect(normalizeValueForColumn('1 = 1', 'date')).toBeNull();
      expect(normalizeValueForColumn('2025-01-01', 'date')).toBeTypeOf('string');
    });

    it('coerces numeric and boolean strings for typed columns', () => {
      expect(normalizeValueForColumn('42.5', 'float')).toBe(42.5);
      expect(normalizeValueForColumn('42', 'integer')).toBe(42);
      expect(normalizeValueForColumn('42.0', 'integer')).toBe(42);
      expect(normalizeValueForColumn('2e3', 'integer')).toBe(2000);
      expect(normalizeValueForColumn('1,234', 'integer')).toBe(1234);
      expect(normalizeValueForColumn('yes', 'boolean')).toBe(true);
      expect(normalizeValueForColumn('not-a-number', 'float')).toBeNull();
      expect(normalizeValueForColumn('42.1', 'integer')).toBeNull();
    });

    it('treats null-like tokens as null', () => {
      expect(normalizeValueForColumn('N/A', 'integer')).toBeNull();
      expect(normalizeValueForColumn('null', 'float')).toBeNull();
      expect(normalizeValueForColumn(' -- ', 'date')).toBeNull();
    });

    it('throws in strict mode when coercion fails', () => {
      expect(() =>
        normalizeValueForColumn('not-a-number', 'float', { strictMode: true, columnName: 'amount' })
      ).toThrow(/cannot be coerced to float/);
    });

    it('does not throw in strict mode for null-like tokens', () => {
      expect(() =>
        normalizeValueForColumn('N/A', 'integer', { strictMode: true, columnName: 'position' })
      ).not.toThrow();
    });

    it('removes null bytes for string columns', () => {
      expect(normalizeValueForColumn('a\u0000b', 'string')).toBe('ab');
    });
  });
});

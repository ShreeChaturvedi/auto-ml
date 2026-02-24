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
    it('parses CSV rows', () => {
      const rows = parseDatasetRows(
        Buffer.from('id,name\n1,A\n2,B'),
        'csv'
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: '1', name: 'A' });
    });

    it('parses JSON arrays', () => {
      const rows = parseDatasetRows(
        Buffer.from(JSON.stringify([{ id: 1 }, { id: 2 }])),
        'json'
      );

      expect(rows).toHaveLength(2);
      expect(rows[1]).toEqual({ id: 2 });
    });

    it('parses NDJSON payloads', () => {
      const rows = parseDatasetRows(
        Buffer.from('{"id": 1}\n{"id": 2}\n'),
        'json'
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: 1 });
    });
  });

  describe('normalizeValueForColumn', () => {
    it('coerces invalid date strings to null', () => {
      expect(normalizeValueForColumn('1 = 1', 'date')).toBeNull();
      expect(normalizeValueForColumn('2025-01-01', 'date')).toBeTypeOf('string');
    });

    it('coerces numeric and boolean strings for typed columns', () => {
      expect(normalizeValueForColumn('42.5', 'number')).toBe(42.5);
      expect(normalizeValueForColumn('yes', 'boolean')).toBe(true);
      expect(normalizeValueForColumn('not-a-number', 'number')).toBeNull();
    });
  });
});

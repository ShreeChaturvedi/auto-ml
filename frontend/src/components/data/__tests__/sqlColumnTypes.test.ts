import { describe, expect, it } from 'vitest';

import {
  extractColumnTypesFromQuery,
  mapColumnToColumnDataType,
  mapPostgresTypeToColumnDataType
} from '@/lib/sql/sqlColumnTypes';

describe('sqlColumnTypes', () => {
  describe('mapPostgresTypeToColumnDataType', () => {
    it.each([
      ['integer', 'integer'],
      ['int8', 'integer'],
      ['numeric', 'float'],
      ['bool', 'boolean'],
      ['timestamp', 'date'],
      ['varchar', 'string'],
      ['mystery_domain_type', 'unknown'],
      ['pg_catalog.int4', 'integer'],
      ['timestamp(6) with time zone', 'date'],
      ['_int4', 'integer'],
      ['varchar[]', 'string'],
      ['money', 'float']
    ])('maps %s to %s', (input, expected) => {
      expect(mapPostgresTypeToColumnDataType(input)).toBe(expected);
    });
  });

  describe('mapColumnToColumnDataType with OID', () => {
    it.each([
      [{ name: 'id', dataTypeID: 23 }, 'integer'],
      [{ name: 'price', dataTypeID: 1700 }, 'float'],
      [{ name: 'created_at', dataTypeID: 1184 }, 'date'],
      [{ name: 'is_active', dataTypeID: 16 }, 'boolean'],
      [{ name: 'name', dataTypeID: 25 }, 'string'],
      [{ name: 'custom_type', dataTypeID: 999999 }, 'unknown']
    ])('falls back to OID mapping for %o', (input, expected) => {
      expect(mapColumnToColumnDataType(input)).toBe(expected);
    });
  });

  it('extracts a full column type map for query results', () => {
    expect(
      extractColumnTypesFromQuery([
        { name: 'id', dataType: 'int4' },
        { name: 'total', dataTypeID: 1700 },
        { name: 'notes', dataType: 'text' }
      ])
    ).toEqual({
      id: 'integer',
      total: 'float',
      notes: 'string'
    });
  });

  it('uses OID fallback when dataType is unknown', () => {
    expect(
      mapColumnToColumnDataType({ name: 'legacy_bigint', dataType: 'unknown', dataTypeID: 20 })
    ).toBe('integer');
  });

  describe('inferring types from row values', () => {
    const rows = [
      { ratio: 1.25, happened_at: '2026-03-01T08:30:00Z', active: true },
      { ratio: 2.5, happened_at: '2026-03-02T10:00:00Z', active: false }
    ];

    it.each([
      ['ratio', 'float'],
      ['happened_at', 'date'],
      ['active', 'boolean']
    ])('infers %s as %s from row values', (columnName, expected) => {
      expect(mapColumnToColumnDataType({ name: columnName, dataType: 'unknown' }, rows)).toBe(expected);
    });
  });

  it('falls back to string for unrecognized named PostgreSQL types', () => {
    expect(mapColumnToColumnDataType({ name: 'status', dataType: 'order_status_enum' })).toBe('string');
  });
});

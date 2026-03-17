import { describe, expect, it } from 'vitest';

import {
  extractColumnTypesFromQuery,
  mapColumnToColumnDataType,
  mapPostgresTypeToColumnDataType
} from '@/lib/sql/sqlColumnTypes';

describe('sqlColumnTypes', () => {
  it('maps PostgreSQL type names to frontend column data types', () => {
    expect(mapPostgresTypeToColumnDataType('integer')).toBe('integer');
    expect(mapPostgresTypeToColumnDataType('int8')).toBe('integer');
    expect(mapPostgresTypeToColumnDataType('numeric')).toBe('float');
    expect(mapPostgresTypeToColumnDataType('bool')).toBe('boolean');
    expect(mapPostgresTypeToColumnDataType('timestamp')).toBe('date');
    expect(mapPostgresTypeToColumnDataType('varchar')).toBe('string');
    expect(mapPostgresTypeToColumnDataType('mystery_domain_type')).toBe('unknown');
  });

  it('normalizes schema-qualified, parameterized, and array type names', () => {
    expect(mapPostgresTypeToColumnDataType('pg_catalog.int4')).toBe('integer');
    expect(mapPostgresTypeToColumnDataType('timestamp(6) with time zone')).toBe('date');
    expect(mapPostgresTypeToColumnDataType('_int4')).toBe('integer');
    expect(mapPostgresTypeToColumnDataType('varchar[]')).toBe('string');
    expect(mapPostgresTypeToColumnDataType('money')).toBe('float');
  });

  it('falls back to OID mapping when type name is missing', () => {
    expect(mapColumnToColumnDataType({ name: 'id', dataTypeID: 23 })).toBe('integer');
    expect(mapColumnToColumnDataType({ name: 'price', dataTypeID: 1700 })).toBe('float');
    expect(mapColumnToColumnDataType({ name: 'created_at', dataTypeID: 1184 })).toBe('date');
    expect(mapColumnToColumnDataType({ name: 'is_active', dataTypeID: 16 })).toBe('boolean');
    expect(mapColumnToColumnDataType({ name: 'name', dataTypeID: 25 })).toBe('string');
    expect(mapColumnToColumnDataType({ name: 'custom_type', dataTypeID: 999999 })).toBe('unknown');
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

  it('infers types from row values when metadata is unresolved', () => {
    const rows = [
      { ratio: 1.25, happened_at: '2026-03-01T08:30:00Z', active: true },
      { ratio: 2.5, happened_at: '2026-03-02T10:00:00Z', active: false }
    ];

    expect(mapColumnToColumnDataType({ name: 'ratio', dataType: 'unknown' }, rows)).toBe('float');
    expect(mapColumnToColumnDataType({ name: 'happened_at', dataType: 'unknown' }, rows)).toBe('date');
    expect(mapColumnToColumnDataType({ name: 'active', dataType: 'unknown' }, rows)).toBe('boolean');
  });

  it('falls back to string for unrecognized named PostgreSQL types', () => {
    expect(mapColumnToColumnDataType({ name: 'status', dataType: 'order_status_enum' })).toBe('string');
  });
});

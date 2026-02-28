import { describe, expect, it } from 'vitest';

import {
  extractColumnTypesFromQuery,
  mapColumnToColumnDataType,
  mapPostgresTypeToColumnDataType
} from '../sqlColumnTypes';

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

  it('falls back to OID mapping when type name is missing', () => {
    expect(mapColumnToColumnDataType({ name: 'id', dataTypeID: 23 })).toBe('integer');
    expect(mapColumnToColumnDataType({ name: 'price', dataTypeID: 1700 })).toBe('float');
    expect(mapColumnToColumnDataType({ name: 'created_at', dataTypeID: 1184 })).toBe('date');
    expect(mapColumnToColumnDataType({ name: 'is_active', dataTypeID: 16 })).toBe('boolean');
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
});

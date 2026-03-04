import { describe, expect, it } from 'vitest';

import { resolveTypeNameFromPgCatalog } from './sqlExecutor.js';

describe('sqlExecutor type-name resolution', () => {
  it('resolves domain types to their base type name', () => {
    expect(resolveTypeNameFromPgCatalog({
      oid: 50000,
      typname: 'currency_code_domain',
      typtype: 'd',
      typbasetype: 1043,
      typelem: 0,
      base_typname: 'varchar',
      elem_typname: null
    })).toBe('varchar');
  });

  it('resolves PostgreSQL internal array names to SQL-style array names', () => {
    expect(resolveTypeNameFromPgCatalog({
      oid: 1007,
      typname: '_int4',
      typtype: 'b',
      typbasetype: 0,
      typelem: 23,
      base_typname: null,
      elem_typname: 'int4'
    })).toBe('int4[]');
  });

  it('resolves domains over array base types', () => {
    expect(resolveTypeNameFromPgCatalog({
      oid: 50001,
      typname: 'score_bucket_domain',
      typtype: 'd',
      typbasetype: 1007,
      typelem: 0,
      base_typname: '_int4',
      elem_typname: null
    })).toBe('int4[]');
  });

  it('falls back to original type name for non-domain scalar types', () => {
    expect(resolveTypeNameFromPgCatalog({
      oid: 1700,
      typname: 'numeric',
      typtype: 'b',
      typbasetype: 0,
      typelem: 0,
      base_typname: null,
      elem_typname: null
    })).toBe('numeric');
  });
});

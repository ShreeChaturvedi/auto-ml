import type { ColumnDataType } from '@/types/file';

export interface QueryColumnLike {
  name: string;
  dataType?: string;
  dataTypeID?: number;
}

const OID_TO_COLUMN_DATA_TYPE: Record<number, ColumnDataType> = {
  16: 'boolean', // bool
  20: 'integer', // int8 / bigint
  21: 'integer', // int2
  23: 'integer', // int4
  700: 'float', // float4
  701: 'float', // float8
  1700: 'float', // numeric
  1082: 'date', // date
  1083: 'date', // time
  1114: 'date', // timestamp
  1184: 'date', // timestamptz
  1186: 'date', // interval
  1266: 'date', // timetz
};

function normalizePgType(pgType: string): string {
  return pgType.trim().toLowerCase();
}

export function mapPostgresTypeToColumnDataType(pgType: string | undefined): ColumnDataType {
  if (!pgType) return 'unknown';

  const typeLower = normalizePgType(pgType);

  if (
    typeLower === 'smallint' ||
    typeLower === 'integer' ||
    typeLower === 'int' ||
    typeLower === 'int2' ||
    typeLower === 'int4' ||
    typeLower === 'serial' ||
    typeLower === 'smallserial'
  ) {
    return 'integer';
  }

  if (typeLower === 'bigint' || typeLower === 'int8' || typeLower === 'bigserial') {
    return 'integer';
  }

  if (
    typeLower === 'real' ||
    typeLower === 'float4' ||
    typeLower === 'double precision' ||
    typeLower === 'float8' ||
    typeLower === 'numeric' ||
    typeLower === 'decimal'
  ) {
    return 'float';
  }

  if (typeLower === 'boolean' || typeLower === 'bool') {
    return 'boolean';
  }

  if (
    typeLower === 'date' ||
    typeLower === 'time' ||
    typeLower === 'timetz' ||
    typeLower === 'timestamp' ||
    typeLower === 'timestamptz' ||
    typeLower === 'interval' ||
    typeLower === 'timestamp without time zone' ||
    typeLower === 'timestamp with time zone' ||
    typeLower === 'time without time zone' ||
    typeLower === 'time with time zone'
  ) {
    return 'date';
  }

  if (
    typeLower === 'text' ||
    typeLower === 'varchar' ||
    typeLower === 'character varying' ||
    typeLower === 'char' ||
    typeLower === 'character' ||
    typeLower === 'bpchar' ||
    typeLower === 'name' ||
    typeLower === 'uuid' ||
    typeLower === 'json' ||
    typeLower === 'jsonb' ||
    typeLower === 'bytea' ||
    typeLower === 'xml' ||
    typeLower === 'inet' ||
    typeLower === 'cidr' ||
    typeLower === 'macaddr' ||
    typeLower === 'macaddr8'
  ) {
    return 'string';
  }

  return 'unknown';
}

export function mapColumnToColumnDataType(column: QueryColumnLike): ColumnDataType {
  const fromName = mapPostgresTypeToColumnDataType(column.dataType);
  if (fromName !== 'unknown') {
    return fromName;
  }

  if (typeof column.dataTypeID === 'number') {
    return OID_TO_COLUMN_DATA_TYPE[column.dataTypeID] ?? 'unknown';
  }

  return 'unknown';
}

export function extractColumnTypesFromQuery(columns: QueryColumnLike[]): Record<string, ColumnDataType> {
  return Object.fromEntries(columns.map((column) => [column.name, mapColumnToColumnDataType(column)]));
}

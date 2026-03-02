import type { ColumnDataType } from '@/types/file';

export interface QueryColumnLike {
  name: string;
  dataType?: string;
  dataTypeID?: number;
}

const OID_TO_COLUMN_DATA_TYPE: Record<number, ColumnDataType> = {
  16: 'boolean', // bool
  17: 'string', // bytea
  18: 'string', // char
  19: 'string', // name
  20: 'integer', // int8 / bigint
  21: 'integer', // int2
  23: 'integer', // int4
  25: 'string', // text
  26: 'integer', // oid
  700: 'float', // float4
  701: 'float', // float8
  790: 'float', // money
  829: 'string', // macaddr
  869: 'string', // inet
  1700: 'float', // numeric
  1042: 'string', // bpchar / char(n)
  1043: 'string', // varchar
  1082: 'date', // date
  1083: 'date', // time
  1114: 'date', // timestamp
  1184: 'date', // timestamptz
  1186: 'date', // interval
  1266: 'date', // timetz
  2950: 'string', // uuid
  3802: 'string', // jsonb
  1000: 'boolean', // bool[]
  1005: 'integer', // int2[]
  1007: 'integer', // int4[]
  1009: 'string', // text[]
  1015: 'string', // varchar[]
  1016: 'integer', // int8[]
  1021: 'float', // float4[]
  1022: 'float', // float8[]
  1115: 'date', // timestamp[]
  1185: 'date', // timestamptz[]
  1231: 'float', // numeric[]
  2951: 'string', // uuid[]
  3807: 'string', // jsonb[]
};

function normalizePgType(pgType: string): string {
  let normalized = pgType.trim().toLowerCase().replace(/"/g, '');
  if (normalized.includes('.')) {
    const segments = normalized.split('.');
    normalized = segments[segments.length - 1] ?? normalized;
  }

  // Remove type modifiers: numeric(12,2), timestamp(6) with time zone, etc.
  normalized = normalized.replace(/\(\s*[\d,\s]*\s*\)/g, '');

  // Normalize PostgreSQL array names:
  // - Internal form: _int4
  // - SQL form: int4[] / int4[][] (multidimensional)
  let arrayDepth = 0;
  while (normalized.endsWith('[]')) {
    normalized = normalized.slice(0, -2).trim();
    arrayDepth += 1;
  }
  while (normalized.startsWith('_')) {
    normalized = normalized.slice(1);
    arrayDepth += 1;
  }

  normalized = normalized.replace(/\s+/g, ' ').trim();
  if (arrayDepth > 0) {
    return `${normalized}[]`;
  }
  return normalized;
}

export function mapPostgresTypeToColumnDataType(pgType: string | undefined): ColumnDataType {
  if (!pgType) return 'unknown';

  const typeLower = normalizePgType(pgType);
  if (!typeLower) return 'unknown';

  if (typeLower.endsWith('[]')) {
    return mapPostgresTypeToColumnDataType(typeLower.slice(0, -2));
  }

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

  if (
    typeLower === 'bigint' ||
    typeLower === 'int8' ||
    typeLower === 'bigserial' ||
    typeLower === 'serial8' ||
    typeLower === 'oid' ||
    typeLower === 'xid' ||
    typeLower === 'cid'
  ) {
    return 'integer';
  }

  if (
    typeLower === 'real' ||
    typeLower === 'float' ||
    typeLower === 'float4' ||
    typeLower === 'double precision' ||
    typeLower === 'float8' ||
    typeLower === 'numeric' ||
    typeLower === 'decimal' ||
    typeLower === 'money'
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
    typeLower === 'citext' ||
    typeLower === 'inet' ||
    typeLower === 'cidr' ||
    typeLower === 'macaddr' ||
    typeLower === 'macaddr8' ||
    typeLower === 'enum' ||
    typeLower === 'record' ||
    typeLower === 'bit' ||
    typeLower === 'varbit' ||
    typeLower === 'regclass' ||
    typeLower === 'regtype' ||
    typeLower === 'regrole' ||
    typeLower === 'regnamespace' ||
    typeLower === 'regproc' ||
    typeLower === 'regprocedure' ||
    typeLower === 'regoper' ||
    typeLower === 'regoperator' ||
    typeLower === 'regconfig' ||
    typeLower === 'regdictionary' ||
    typeLower === 'pg_lsn'
  ) {
    return 'string';
  }

  if (typeLower.endsWith('range') || typeLower.endsWith('multirange')) {
    return 'string';
  }

  return 'unknown';
}

function inferTypeFromValue(value: unknown): ColumnDataType {
  if (value == null) return 'unknown';
  if (value instanceof Date) return 'date';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
  if (typeof value === 'bigint') return 'integer';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'string';
    const inferred = value.map(inferTypeFromValue).filter((type) => type !== 'unknown');
    if (inferred.length === 0) return 'unknown';
    if (inferred.every((type) => type === 'integer')) return 'integer';
    if (inferred.every((type) => type === 'integer' || type === 'float')) return 'float';
    if (inferred.every((type) => type === 'boolean')) return 'boolean';
    if (inferred.every((type) => type === 'date')) return 'date';
    return 'string';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'string';

    if (/^(true|false)$/i.test(trimmed)) return 'boolean';
    if (/^[+-]?\d+$/.test(trimmed)) return 'integer';

    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue) && /[.e]/i.test(trimmed)) return 'float';

    if (/^\d{4}-\d{2}-\d{2}(?:[ t].*)?$/i.test(trimmed) && !Number.isNaN(Date.parse(trimmed))) {
      return 'date';
    }

    return 'string';
  }

  return 'string';
}

function inferColumnTypeFromRows(columnName: string, rows: Array<Record<string, unknown>>): ColumnDataType {
  let observed: ColumnDataType = 'unknown';
  const maxRows = Math.min(rows.length, 200);

  for (let i = 0; i < maxRows; i += 1) {
    const row = rows[i];
    const candidate = inferTypeFromValue(row[columnName]);
    if (candidate === 'unknown') continue;

    if (observed === 'unknown') {
      observed = candidate;
      continue;
    }

    if (
      (observed === 'integer' && candidate === 'float') ||
      (observed === 'float' && candidate === 'integer')
    ) {
      observed = 'float';
      continue;
    }

    if (observed !== candidate) {
      return 'string';
    }
  }

  return observed;
}

export function mapColumnToColumnDataType(
  column: QueryColumnLike,
  rows: Array<Record<string, unknown>> = []
): ColumnDataType {
  const fromName = mapPostgresTypeToColumnDataType(column.dataType);
  if (fromName !== 'unknown') {
    return fromName;
  }

  if (typeof column.dataTypeID === 'number') {
    const fromOid = OID_TO_COLUMN_DATA_TYPE[column.dataTypeID] ?? 'unknown';
    if (fromOid !== 'unknown') {
      return fromOid;
    }
  }

  if (typeof column.dataType === 'string') {
    const normalized = normalizePgType(column.dataType);
    if (normalized.length > 0 && normalized !== 'unknown') {
      return 'string';
    }
  }

  const inferred = inferColumnTypeFromRows(column.name, rows);
  if (inferred !== 'unknown') {
    return inferred;
  }

  return 'unknown';
}

export function extractColumnTypesFromQuery(
  columns: QueryColumnLike[],
  rows: Array<Record<string, unknown>> = []
): Record<string, ColumnDataType> {
  return Object.fromEntries(columns.map((column) => [column.name, mapColumnToColumnDataType(column, rows)]));
}

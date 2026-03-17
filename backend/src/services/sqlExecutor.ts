import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';


import { env } from '../config.js';
import { getDbPool, hasDatabaseConfiguration } from '../db.js';
import type { QueryResultPayload } from '../types/query.js';

import { buildEdaSummary } from './edaSummary.js';
import { validateReadOnlySql } from './sqlValidator.js';

interface PgTypeCatalogRow {
  oid: number;
  typname: string;
  typtype: string;
  typbasetype: number;
  typelem: number;
  base_typname: string | null;
  elem_typname: string | null;
}

function normalizeArrayTypeName(typeName: string, elementTypeName: string | null): string {
  const normalizedTypeName = typeName.trim();
  const normalizedElementTypeName = elementTypeName?.trim() ?? '';

  if (normalizedElementTypeName) {
    return `${normalizedElementTypeName}[]`;
  }
  if (normalizedTypeName.startsWith('_')) {
    return `${normalizedTypeName.slice(1)}[]`;
  }
  return normalizedTypeName;
}

export function resolveTypeNameFromPgCatalog(row: PgTypeCatalogRow): string {
  const typeName = row.typname?.trim();
  if (!typeName) {
    return 'unknown';
  }

  // Domains should resolve to their base type so frontend mapping can classify
  // the column even when the domain type name itself is custom.
  if (row.typtype === 'd' && row.base_typname) {
    return normalizeArrayTypeName(row.base_typname, null);
  }

  if (row.typelem > 0) {
    return normalizeArrayTypeName(typeName, row.elem_typname);
  }

  return typeName;
}

/**
 * Fetch type names from PostgreSQL for the given type OIDs
 * Uses the pg_type system catalog to get accurate type names
 */
async function getTypeNames(dataTypeIDs: number[], client: PoolClient): Promise<Map<number, string>> {
  if (dataTypeIDs.length === 0) {
    return new Map();
  }

  // Filter invalid IDs and deduplicate OIDs to avoid unnecessary query params.
  const uniqueOIDs = [...new Set(dataTypeIDs.filter((oid) => Number.isInteger(oid) && oid > 0))];
  if (uniqueOIDs.length === 0) {
    return new Map();
  }

  const placeholders = uniqueOIDs.map((_, i) => `$${i + 1}`).join(', ');
  
  const result = await client.query<PgTypeCatalogRow>(
    `
      SELECT
        t.oid,
        t.typname,
        t.typtype,
        t.typbasetype,
        t.typelem,
        bt.typname AS base_typname,
        et.typname AS elem_typname
      FROM pg_type t
      LEFT JOIN pg_type bt ON bt.oid = t.typbasetype
      LEFT JOIN pg_type et ON et.oid = t.typelem
      WHERE t.oid IN (${placeholders})
    `,
    uniqueOIDs
  );

  const typeMap = new Map<number, string>();
  for (const row of result.rows) {
    typeMap.set(row.oid, resolveTypeNameFromPgCatalog(row));
  }

  return typeMap;
}

export async function executeReadOnlyQuery({ sql }: { sql: string }): Promise<QueryResultPayload> {
  if (!hasDatabaseConfiguration()) {
    throw Object.assign(new Error('Database is not configured'), { statusCode: 503 });
  }

  const { normalizedSql } = validateReadOnlySql(sql, {
    defaultLimit: env.sqlDefaultLimit,
    maxRows: env.sqlMaxRows
  });

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${env.sqlStatementTimeoutMs}`);
    const startedAt = Date.now();
    const result = await client.query(normalizedSql);
    const executionMs = Date.now() - startedAt;
    const limitedRows = result.rows.slice(0, env.sqlMaxRows);
    const eda = buildEdaSummary(limitedRows, { source: 'query-result', totalRows: result.rows.length });

    // Resolve human-readable type names from pg_type, but do not fail the
    // query result payload if catalog lookup itself fails.
    const dataTypeIDs = (result.fields ?? []).map((field) => field.dataTypeID);
    let typeMap = new Map<number, string>();
    try {
      typeMap = await getTypeNames(dataTypeIDs, client);
    } catch (error) {
      console.warn('[sqlExecutor] Failed to resolve type names from pg_type:', error);
    }

    const payload: QueryResultPayload = {
      queryId: randomUUID(),
      sql: normalizedSql,
      columns: (result.fields ?? []).map((field) => ({
        name: field.name,
        dataTypeID: field.dataTypeID,
        dataType: typeMap.get(field.dataTypeID) || 'unknown'
      })),
      rows: limitedRows,
      rowCount: limitedRows.length,
      executionMs,
      cached: false,
      eda
    };

    await client.query('COMMIT');
    return payload;
  } catch (error) {
    await safeRollback(client);
    throw error;
  } finally {
    client.release();
  }
}

async function safeRollback(client: PoolClient) {
  try {
    await client.query('ROLLBACK');
  } catch (error) {
    console.error('[sqlExecutor] Failed to rollback transaction', error);
  }
}

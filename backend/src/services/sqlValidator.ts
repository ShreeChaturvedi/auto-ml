import { astVisitor, parseFirst, type Statement } from 'pgsql-ast-parser';

import {
  BLOCKED_SQL_TABLE_PREFIXES,
  BLOCKED_SQL_TABLES
} from './sqlTablePolicy.js';

const READ_ONLY_KEYWORDS = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'grant', 'revoke', 'truncate'];

export interface ValidateSqlOptions {
  defaultLimit: number;
  maxRows: number;
  /** Tables the user is allowed to query (project dataset tables). Bypasses blocklist. */
  allowedTables?: Set<string>;
}

export interface ValidateSqlResult {
  normalizedSql: string;
  limitAppended: boolean;
}

/**
 * Strip SQL comments (both -- line comments and block comments)
 * to get the actual SQL statement for validation
 */
function stripSqlComments(sql: string): string {
  // Remove -- line comments
  let result = sql.replace(/--[^\n]*(\n|$)/g, '\n');
  // Remove /* */ block comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  return result.trim();
}

/**
 * Strip string literals to prevent false positives when scanning for table
 * references (e.g. WHERE name = 'users' should not trigger a block).
 */
function stripStringLiterals(sql: string): string {
  return sql.replace(/'[^']*'/g, "''");
}

/**
 * Extract table-like identifiers from SQL. Matches tokens that follow
 * FROM, JOIN, or UPDATE (already blocked but defense-in-depth) keywords,
 * including optional schema-qualified and double-quoted identifiers.
 */
export function extractTableReferences(sql: string): string[] {
  const statement = parseFirst(stripStringLiterals(sql));
  const tables = new Set<string>();
  const scopeStack: Set<string>[] = [];

  const normalize = (value: string | undefined) =>
    value?.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"').toLowerCase() ?? '';

  const isVisibleCte = (name: string) => scopeStack.some((scope) => scope.has(name));

  const visitor = astVisitor((visit) => ({
    with: (value) => {
      const visibleBindings = new Set<string>();
      for (const binding of value.bind) {
        scopeStack.push(new Set(visibleBindings));
        try {
          visit.statement(binding.statement as unknown as Statement);
        } finally {
          scopeStack.pop();
          visibleBindings.add(normalize(binding.alias.name));
        }
      }

      scopeStack.push(new Set(visibleBindings));
      try {
        visit.statement(value.in as unknown as Statement);
      } finally {
        scopeStack.pop();
      }
    },
    withRecursive: (value) => {
      scopeStack.push(new Set([normalize(value.alias.name)]));
      try {
        visit.super().withRecursive(value);
      } finally {
        scopeStack.pop();
      }
    },
    fromTable: (from) => {
      const tableName = normalize(from.name.name);
      const schemaName = normalize(from.name.schema);
      if (tableName && !isVisibleCte(tableName)) {
        tables.add(schemaName ? `${schemaName}.${tableName}` : tableName);
      }
      visit.super().fromTable(from);
    }
  }));

  visitor.statement(statement);
  return [...tables];
}

/**
 * Check that the query does not reference any blocked tables.
 * Tables in the allowedTables set bypass the blocklist (project dataset tables).
 */
function assertNoBlockedTables(sql: string, allowedTables?: Set<string>): void {
  const tables = extractTableReferences(sql);
  for (const table of tables) {
    if (allowedTables?.has(table)) continue;
    // Strip schema prefix for comparison (e.g. "public.users" -> "users")
    const unqualified = table.includes('.') ? table.split('.').pop()! : table;
    if (allowedTables?.has(unqualified)) continue;
    if (BLOCKED_SQL_TABLES.has(unqualified)) {
      throw new Error(`Access to table "${unqualified}" is not allowed`);
    }
    for (const prefix of BLOCKED_SQL_TABLE_PREFIXES) {
      if (unqualified.startsWith(prefix) || table.startsWith(prefix)) {
        throw new Error(`Access to system catalog "${table}" is not allowed`);
      }
    }
  }
}

export function validateReadOnlySql(sql: string, options: ValidateSqlOptions): ValidateSqlResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error('SQL statement required');
  }

  // Strip comments to find the actual SQL statement
  const strippedSql = stripSqlComments(trimmed);
  if (!strippedSql) {
    throw new Error('SQL statement required (query contains only comments)');
  }

  // Allow a single trailing semicolon, but reject semicolons elsewhere.
  const normalizedStatement = strippedSql.replace(/;\s*$/, '').trim();
  if (!normalizedStatement) {
    throw new Error('SQL statement required');
  }

  const lower = normalizedStatement.toLowerCase();
  if (!(lower.startsWith('select') || lower.startsWith('with'))) {
    throw new Error('Only SELECT/CTE statements are allowed');
  }

  for (const keyword of READ_ONLY_KEYWORDS) {
    if (lower.includes(`${keyword} `) || lower.includes(`${keyword}\n`)) {
      throw new Error(`Statement contains disallowed keyword: ${keyword.toUpperCase()}`);
    }
  }

  if (normalizedStatement.includes(';')) {
    throw new Error('Multiple statements are not allowed');
  }

  // Block access to sensitive application tables and system catalogs
  assertNoBlockedTables(normalizedStatement, options.allowedTables);

  const limitRegex = /\blimit\s*(\(\s*)?\d+/i;
  if (!limitRegex.test(normalizedStatement)) {
    const normalized = `${normalizedStatement} LIMIT ${options.defaultLimit}`;
    return { normalizedSql: normalized, limitAppended: true };
  }

  return { normalizedSql: normalizedStatement, limitAppended: false };
}

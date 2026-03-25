const READ_ONLY_KEYWORDS = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'grant', 'revoke', 'truncate'];

const BLOCKED_TABLES = new Set([
  'users', 'refresh_tokens', 'user_settings',
  'notebooks', 'cells', 'cell_outputs', 'savepoints',
  'workflow_runs', 'workflow_events', 'workflow_artifacts',
  'workflow_approvals', 'workflow_handoffs', 'workflow_notebook_bindings',
  'documents', 'embeddings', 'chunks',
  'query_results', 'schema_migrations',
]);

const BLOCKED_SCHEMA_PREFIXES = ['pg_', 'information_schema'];

const TABLE_REF_REGEX = /\b(?:FROM|JOIN)\s+(?:"([^"]+)"|([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?))/gi;

/**
 * Extract table references from a SQL statement.
 * Matches unquoted and double-quoted identifiers after FROM/JOIN keywords.
 */
export function extractTableReferences(sql: string): string[] {
  const tables: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = TABLE_REF_REGEX.exec(sql)) !== null) {
    const name = (match[1] ?? match[2]).toLowerCase();
    tables.push(name);
  }
  return tables;
}

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

  const referencedTables = extractTableReferences(normalizedStatement);
  const allowedTables = options.allowedTables;
  for (const table of referencedTables) {
    if (allowedTables?.has(table)) continue;
    if (BLOCKED_TABLES.has(table) || BLOCKED_SCHEMA_PREFIXES.some((prefix) => table.startsWith(prefix))) {
      throw new Error(`Access denied: queries against table '${table}' are not permitted`);
    }
  }

  const limitRegex = /\blimit\s+\d+/i;
  if (!limitRegex.test(normalizedStatement)) {
    const normalized = `${normalizedStatement} LIMIT ${options.defaultLimit}`;
    return { normalizedSql: normalized, limitAppended: true };
  }

  return { normalizedSql: normalizedStatement, limitAppended: false };
}

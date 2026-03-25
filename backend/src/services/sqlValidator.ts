const READ_ONLY_KEYWORDS = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'grant', 'revoke', 'truncate'];

// Application tables that must never be queried through the SQL endpoint.
const BLOCKED_TABLES = new Set([
  'users',
  'refresh_tokens',
  'password_reset_tokens',
  'user_settings',
  'projects',
  'datasets',
  'documents',
  'chunks',
  'embeddings',
  'query_results',
  'query_cache',
  'notebooks',
  'cells',
  'cell_outputs',
  'nl_placeholder_suggestions',
  'tuning_studies',
  'models',
  'savepoints',
  'workflow_runs',
  'workflow_events',
  'workflow_artifacts',
  'workflow_approvals',
  'workflow_handoffs',
  'workflow_notebook_bindings'
]);

// System catalog prefixes that must be blocked.
const BLOCKED_TABLE_PREFIXES = ['pg_', 'information_schema'];

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
  const cleaned = stripStringLiterals(sql);
  const tables: string[] = [];

  // Identifier: bare (a.b or a), or double-quoted ("table")
  const idToken = String.raw`(?:"[^"]+"|\b[a-z_]\w*\b)(?:\.(?:"[^"]+"|\b[a-z_]\w*\b))?`;

  // Match the first table after FROM/JOIN and any comma-separated continuations
  const fromPattern = new RegExp(
    String.raw`\b(?:from|join)\s+(${idToken})` +
    String.raw`(?:\s*,\s*(${idToken}))*`,
    'gi'
  );

  let match: RegExpExecArray | null;
  while ((match = fromPattern.exec(cleaned)) !== null) {
    // Capture group 1 is the first table, group 2 is the last comma-separated table.
    // Re-extract all comma-separated tables from the full match to get intermediates.
    const fullFragment = match[0].replace(/^(?:from|join)\s+/i, '');
    const idPattern = new RegExp(idToken, 'gi');
    let idMatch: RegExpExecArray | null;
    while ((idMatch = idPattern.exec(fullFragment)) !== null) {
      const raw = idMatch[0].replace(/"/g, '').trim();
      if (raw) tables.push(raw.toLowerCase());
    }
  }

  return [...new Set(tables)];
}

/**
 * Check that the query does not reference any blocked tables.
 */
function assertNoBlockedTables(sql: string): void {
  const tables = extractTableReferences(sql);
  for (const table of tables) {
    // Strip schema prefix for comparison (e.g. "public.users" -> "users")
    const unqualified = table.includes('.') ? table.split('.').pop()! : table;
    if (BLOCKED_TABLES.has(unqualified)) {
      throw new Error(`Access to table "${unqualified}" is not allowed`);
    }
    for (const prefix of BLOCKED_TABLE_PREFIXES) {
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
  assertNoBlockedTables(normalizedStatement);

  const limitRegex = /\blimit\s+\d+/i;
  if (!limitRegex.test(normalizedStatement)) {
    const normalized = `${normalizedStatement} LIMIT ${options.defaultLimit}`;
    return { normalizedSql: normalized, limitAppended: true };
  }

  return { normalizedSql: normalizedStatement, limitAppended: false };
}

const READ_ONLY_KEYWORDS = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'grant', 'revoke', 'truncate'];

export interface ValidateSqlOptions {
  defaultLimit: number;
  maxRows: number;
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

  const lower = strippedSql.toLowerCase();
  if (!(lower.startsWith('select') || lower.startsWith('with'))) {
    throw new Error('Only SELECT/CTE statements are allowed');
  }

  for (const keyword of READ_ONLY_KEYWORDS) {
    if (lower.includes(`${keyword} `) || lower.includes(`${keyword}\n`)) {
      throw new Error(`Statement contains disallowed keyword: ${keyword.toUpperCase()}`);
    }
  }

  if (lower.includes(';')) {
    throw new Error('Multiple statements are not allowed');
  }

  const limitRegex = /\blimit\s+\d+/i;
  if (!limitRegex.test(trimmed)) {
    const normalized = `${trimmed} LIMIT ${options.defaultLimit}`;
    return { normalizedSql: normalized, limitAppended: true };
  }

  return { normalizedSql: trimmed, limitAppended: false };
}

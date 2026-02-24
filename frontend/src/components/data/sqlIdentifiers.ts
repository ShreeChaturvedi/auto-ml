import type { QueryMode } from '@/types/file';

const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function quoteSqlIdentifier(identifier: string): string {
  const trimmed = identifier.trim();

  if (trimmed.length === 0) {
    return '""';
  }

  if (SAFE_SQL_IDENTIFIER.test(trimmed)) {
    return trimmed;
  }

  return `"${trimmed.replace(/"/g, '""')}"`;
}

export function withSqlIdentifierHint(
  message: string,
  mode: QueryMode,
  tableName?: string
): string {
  if (mode !== 'sql') {
    return message;
  }

  const normalized = message.toLowerCase();
  const likelyIdentifierIssue =
    normalized.includes('does not exist') ||
    normalized.includes('syntax error at or near') ||
    normalized.includes('missing from-clause entry');

  if (!likelyIdentifierIssue || normalized.includes('double quote')) {
    return message;
  }

  const exampleTable = quoteSqlIdentifier(tableName?.trim() || 'your_table');

  return `${message}
Hint: If a table/column name contains spaces or capitals, wrap it in double quotes (example: SELECT "First Name" FROM ${exampleTable} LIMIT 100).`;
}

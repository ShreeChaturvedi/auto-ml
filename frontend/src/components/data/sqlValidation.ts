/**
 * sqlValidation.ts — Pure SQL utility functions for validation, context inference, and data constants.
 *
 * Zero React dependencies. All exports are plain functions or constants.
 * Monaco types are imported as type-only (no runtime dependency).
 */

import type { editor as MonacoEditor } from 'monaco-editor';

// ---------------------------------------------------------------------------
// SQL keyword / function / snippet data
// ---------------------------------------------------------------------------

export const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN',
  'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'ON', 'AS', 'DISTINCT', 'COUNT',
  'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'NULL',
  'IS NULL', 'IS NOT NULL', 'ASC', 'DESC', 'UNION', 'UNION ALL', 'EXCEPT',
  'INTERSECT', 'EXISTS', 'ALL', 'ANY', 'WITH', 'OVER', 'PARTITION BY',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'COALESCE', 'NULLIF', 'CAST', 'CONVERT'
] as const;

export const SQL_FUNCTIONS = [
  {
    label: 'COUNT',
    insertText: 'COUNT(${1:*})',
    documentation: 'Returns the number of input rows matching the expression.'
  },
  {
    label: 'SUM',
    insertText: 'SUM(${1:column})',
    documentation: 'Returns the sum of all non-null values.'
  },
  {
    label: 'AVG',
    insertText: 'AVG(${1:column})',
    documentation: 'Returns the average of all non-null values.'
  },
  {
    label: 'MIN',
    insertText: 'MIN(${1:column})',
    documentation: 'Returns the minimum value.'
  },
  {
    label: 'MAX',
    insertText: 'MAX(${1:column})',
    documentation: 'Returns the maximum value.'
  },
  {
    label: 'COALESCE',
    insertText: 'COALESCE(${1:value}, ${2:fallback})',
    documentation: 'Returns the first non-null argument.'
  },
  {
    label: 'DATE_TRUNC',
    insertText: "DATE_TRUNC('${1:day}', ${2:timestamp_column})",
    documentation: 'Truncates a timestamp to a specified precision.'
  }
] as const;

export const SQL_SNIPPETS = [
  {
    label: 'SELECT template',
    insertText: 'SELECT ${1:*}\nFROM ${2:table_name}\nLIMIT ${3:100};',
    documentation: 'Basic SELECT query template.'
  },
  {
    label: 'JOIN template',
    insertText:
      'SELECT ${1:t1.*}, ${2:t2.*}\nFROM ${3:table_one} ${4:t1}\nJOIN ${5:table_two} ${6:t2} ON ${7:t1.id} = ${8:t2.id}\nLIMIT ${9:100};',
    documentation: 'SELECT with INNER JOIN template.'
  },
  {
    label: 'GROUP BY template',
    insertText:
      'SELECT ${1:dimension}, ${2:COUNT(*)} AS ${3:metric}\nFROM ${4:table_name}\nGROUP BY ${5:dimension}\nORDER BY ${6:metric} DESC\nLIMIT ${7:100};',
    documentation: 'Aggregation query template.'
  }
] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export type SqlSuggestionContext = 'table' | 'alias-column' | 'general';

export function normalizeSqlIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
}

export function sanitizeSuggestionToken(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Public pure utility functions
// ---------------------------------------------------------------------------

export function resolveColumnsForTable(
  tableName: string,
  columnsByTable: Record<string, string[]>
): string[] {
  const normalizedTarget = normalizeSqlIdentifier(tableName).toLowerCase();
  for (const [knownTableName, columns] of Object.entries(columnsByTable)) {
    if (normalizeSqlIdentifier(knownTableName).toLowerCase() === normalizedTarget) {
      return columns;
    }
  }
  return [];
}

export function inferSqlSuggestionContext(prefix: string): SqlSuggestionContext {
  const trimmed = prefix.trimEnd();
  if (/[a-zA-Z_][\w$]*\.\s*"?[\w$]*$/i.test(trimmed)) {
    return 'alias-column';
  }
  if (/\b(from|join|update|into|table)\s+"?[\w$]*$/i.test(trimmed)) {
    return 'table';
  }
  return 'general';
}

export function getAliasBeforeDot(prefix: string): string | null {
  const dotMatch = prefix.match(/([a-zA-Z_][\w$]*)\.\s*"?[\w$]*$/i);
  return dotMatch?.[1]?.toLowerCase() ?? null;
}

export function buildAliasToTableMap(
  sqlText: string,
  tableNames: string[]
): Record<string, string> {
  const aliasMap: Record<string, string> = {};
  const tableRefPattern =
    /\b(?:from|join)\s+((?:"[^"]+"|[a-zA-Z_][\w$]*)(?:\.(?:"[^"]+"|[a-zA-Z_][\w$]*))?)(?:\s+(?:as\s+)?([a-zA-Z_][\w$]*))?/gi;

  let match = tableRefPattern.exec(sqlText);
  while (match) {
    const rawTableRef = match[1];
    const rawAlias = match[2];
    const segments = rawTableRef
      .split('.')
      .map((segment) => normalizeSqlIdentifier(segment))
      .filter(Boolean);
    const tableToken = segments[segments.length - 1] ?? normalizeSqlIdentifier(rawTableRef);
    const resolvedTable =
      tableNames.find(
        (tableName) =>
          normalizeSqlIdentifier(tableName).toLowerCase() === tableToken.toLowerCase()
      ) ?? rawTableRef;

    aliasMap[tableToken.toLowerCase()] = resolvedTable;
    if (rawAlias) {
      aliasMap[rawAlias.toLowerCase()] = resolvedTable;
    }

    match = tableRefPattern.exec(sqlText);
  }

  return aliasMap;
}

export function buildSqlMarkers(sqlText: string): MonacoEditor.IMarkerData[] {
  const markers: MonacoEditor.IMarkerData[] = [];
  const openParenStack: Array<{ lineNumber: number; column: number }> = [];
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let singleQuoteStart: { lineNumber: number; column: number } | null = null;
  let doubleQuoteStart: { lineNumber: number; column: number } | null = null;
  let lineNumber = 1;
  let column = 1;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const nextChar = sqlText[index + 1];

    if (char === '\n') {
      lineNumber += 1;
      column = 1;
      continue;
    }

    if (!inDoubleQuote && char === '\'') {
      if (inSingleQuote && nextChar === '\'') {
        index += 1;
        column += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      singleQuoteStart = inSingleQuote ? { lineNumber, column } : null;
      column += 1;
      continue;
    }

    if (!inSingleQuote && char === '"') {
      if (inDoubleQuote && nextChar === '"') {
        index += 1;
        column += 2;
        continue;
      }
      inDoubleQuote = !inDoubleQuote;
      doubleQuoteStart = inDoubleQuote ? { lineNumber, column } : null;
      column += 1;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '(') {
        openParenStack.push({ lineNumber, column });
      } else if (char === ')') {
        const openParen = openParenStack.pop();
        if (!openParen) {
          markers.push({
            severity: 8,
            message: 'Unmatched closing parenthesis',
            startLineNumber: lineNumber,
            startColumn: column,
            endLineNumber: lineNumber,
            endColumn: column + 1
          });
        }
      }
    }

    column += 1;
  }

  for (const openParen of openParenStack) {
    markers.push({
      severity: 8,
      message: 'Unclosed opening parenthesis',
      startLineNumber: openParen.lineNumber,
      startColumn: openParen.column,
      endLineNumber: openParen.lineNumber,
      endColumn: openParen.column + 1
    });
  }

  if (singleQuoteStart) {
    markers.push({
      severity: 8,
      message: 'Unclosed single quote',
      startLineNumber: singleQuoteStart.lineNumber,
      startColumn: singleQuoteStart.column,
      endLineNumber: singleQuoteStart.lineNumber,
      endColumn: singleQuoteStart.column + 1
    });
  }

  if (doubleQuoteStart) {
    markers.push({
      severity: 8,
      message: 'Unclosed double quote',
      startLineNumber: doubleQuoteStart.lineNumber,
      startColumn: doubleQuoteStart.column,
      endLineNumber: doubleQuoteStart.lineNumber,
      endColumn: doubleQuoteStart.column + 1
    });
  }

  return markers;
}

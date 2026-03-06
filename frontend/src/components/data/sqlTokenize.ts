export type SqlTokenType =
  | 'keyword'
  | 'function'
  | 'string'
  | 'number'
  | 'operator'
  | 'punctuation'
  | 'identifier'
  | 'whitespace';

export interface SqlToken {
  text: string;
  type: SqlTokenType;
}

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON',
  'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT',
  'UNION', 'ALL', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'EXISTS',
  'BETWEEN', 'LIKE', 'ILIKE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'ASC', 'DESC', 'TRUE', 'FALSE', 'WITH', 'RECURSIVE', 'OVER', 'PARTITION',
  'WINDOW', 'ROWS', 'RANGE', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW',
  'FETCH', 'NEXT', 'ONLY', 'FIRST', 'LAST', 'NULLS',
]);

const SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF',
  'CAST', 'CONVERT', 'EXTRACT', 'DATE_PART', 'DATE_TRUNC',
  'UPPER', 'LOWER', 'TRIM', 'LENGTH', 'SUBSTRING', 'REPLACE',
  'CONCAT', 'STRING_AGG', 'ARRAY_AGG', 'ROW_NUMBER', 'RANK',
  'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
  'ROUND', 'CEIL', 'FLOOR', 'ABS', 'NOW', 'CURRENT_TIMESTAMP',
]);

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;

  while (i < sql.length) {
    if (/\s/.test(sql[i])) {
      let j = i;
      while (j < sql.length && /\s/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'whitespace' });
      i = j;
      continue;
    }

    if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < sql.length && sql[j] !== '\n') j++;
      tokens.push({ text: sql.slice(i, j), type: 'identifier' });
      i = j;
      continue;
    }

    if (sql[i] === '\'') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '\'' && sql[j + 1] === '\'') {
          j += 2;
          continue;
        }
        if (sql[j] === '\'') {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ text: sql.slice(i, j), type: 'string' });
      i = j;
      continue;
    }

    if (sql[i] === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') {
          j += 2;
          continue;
        }
        if (sql[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      tokens.push({ text: sql.slice(i, j), type: 'identifier' });
      i = j;
      continue;
    }

    if (/\d/.test(sql[i]) || (sql[i] === '.' && i + 1 < sql.length && /\d/.test(sql[i + 1]))) {
      let j = i;
      while (j < sql.length && /[\d.]/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'number' });
      i = j;
      continue;
    }

    if (/[=<>!+\-*/%|]/.test(sql[i])) {
      let j = i + 1;
      if (j < sql.length && /[=<>|]/.test(sql[j])) j++;
      tokens.push({ text: sql.slice(i, j), type: 'operator' });
      i = j;
      continue;
    }

    if (/[(),;.]/.test(sql[i])) {
      tokens.push({ text: sql[i], type: 'punctuation' });
      i++;
      continue;
    }

    if (/[a-zA-Z_]/.test(sql[i])) {
      let j = i;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      const word = sql.slice(i, j);
      const upper = word.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) {
        tokens.push({ text: word, type: 'keyword' });
      } else if (SQL_FUNCTIONS.has(upper)) {
        tokens.push({ text: word, type: 'function' });
      } else {
        tokens.push({ text: word, type: 'identifier' });
      }
      i = j;
      continue;
    }

    tokens.push({ text: sql[i], type: 'identifier' });
    i++;
  }

  return tokens;
}

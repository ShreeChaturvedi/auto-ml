import type { SchemaTableContext } from './types.js';

const SIMPLE_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

export function requiresIdentifierQuoting(identifier: string): boolean {
  return !SIMPLE_IDENTIFIER_PATTERN.test(identifier);
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function buildCaseSensitiveIdentifierLookup(tables: SchemaTableContext[]): Map<string, string> {
  const collisionMap = new Map<string, Set<string>>();

  const addIdentifier = (identifier: string) => {
    if (!requiresIdentifierQuoting(identifier)) {
      return;
    }
    const key = identifier.toLowerCase();
    const existing = collisionMap.get(key) ?? new Set<string>();
    existing.add(identifier);
    collisionMap.set(key, existing);
  };

  tables.forEach((table) => {
    addIdentifier(table.tableName);
    table.columns.forEach((column) => addIdentifier(column.name));
  });

  const lookup = new Map<string, string>();
  collisionMap.forEach((values, key) => {
    if (values.size === 1) {
      const [canonical] = Array.from(values);
      lookup.set(key, canonical);
    }
  });

  return lookup;
}

export function normalizeCaseSensitiveIdentifiers(
  sql: string,
  tables: SchemaTableContext[]
): { sql: string; replacements: string[] } {
  const lookup = buildCaseSensitiveIdentifierLookup(tables);
  if (lookup.size === 0 || !sql.trim()) {
    return { sql, replacements: [] };
  }

  let i = 0;
  const out: string[] = [];
  const applied = new Set<string>();

  while (i < sql.length) {
    const current = sql[i];
    const next = sql[i + 1];

    if (current === '-' && next === '-') {
      const end = sql.indexOf('\n', i + 2);
      if (end === -1) {
        out.push(sql.slice(i));
        i = sql.length;
      } else {
        out.push(sql.slice(i, end + 1));
        i = end + 1;
      }
      continue;
    }

    if (current === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) {
        out.push(sql.slice(i));
        i = sql.length;
      } else {
        out.push(sql.slice(i, end + 2));
        i = end + 2;
      }
      continue;
    }

    if (current === '\'') {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === '\'' && sql[end + 1] === '\'') {
          end += 2;
          continue;
        }
        if (sql[end] === '\'') {
          end += 1;
          break;
        }
        end += 1;
      }
      out.push(sql.slice(i, end));
      i = end;
      continue;
    }

    if (current === '"') {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === '"' && sql[end + 1] === '"') {
          end += 2;
          continue;
        }
        if (sql[end] === '"') {
          end += 1;
          break;
        }
        end += 1;
      }
      out.push(sql.slice(i, end));
      i = end;
      continue;
    }

    if (/[a-zA-Z_]/.test(current)) {
      let end = i + 1;
      while (end < sql.length && /[a-zA-Z0-9_$]/.test(sql[end])) {
        end += 1;
      }
      const token = sql.slice(i, end);
      const canonical = lookup.get(token.toLowerCase());
      if (canonical) {
        out.push(quoteIdentifier(canonical));
        applied.add(canonical);
      } else {
        out.push(token);
      }
      i = end;
      continue;
    }

    out.push(current);
    i += 1;
  }

  return {
    sql: out.join(''),
    replacements: Array.from(applied.values()).sort()
  };
}

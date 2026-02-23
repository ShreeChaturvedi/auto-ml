import { randomUUID } from 'node:crypto';

import { validateReadOnlySql } from './sqlValidator.js';

interface GenerateSqlOptions {
  nlQuery: string;
  defaultTable?: string;
}

export interface GeneratedSql {
  sql: string;
  rationale: string;
  queryId: string;
}

const KEYWORD_MAP: Record<string, string> = {
  project: 'projects',
  dataset: 'datasets',
  document: 'documents'
};

export function generateSqlFromNaturalLanguage({ nlQuery, defaultTable = 'projects' }: GenerateSqlOptions): GeneratedSql {
  const lower = nlQuery.toLowerCase();
  const selectedTable =
    Object.entries(KEYWORD_MAP).find(([keyword]) => lower.includes(keyword))?.[1] ?? defaultTable;
  const table = sanitizeIdentifier(selectedTable);
  const sql = `SELECT * FROM ${table} LIMIT 50`;
  validateReadOnlySql(sql, { defaultLimit: 50, maxRows: 1000 });

  return {
    sql,
    rationale: `Auto-generated query targeting ${table} based on keywords in the prompt.`,
    queryId: randomUUID()
  };
}

function sanitizeIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'projects';

  const safe = trimmed
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[^a-zA-Z]/, 'table_')
    .toLowerCase()
    .slice(0, 63);

  return safe || 'projects';
}

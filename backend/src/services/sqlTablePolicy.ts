const BLOCKED_SQL_TABLES = new Set([
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

const BLOCKED_SQL_TABLE_PREFIXES = ['pg_', 'information_schema'];

export function normalizeSqlTableName(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/^"(.*)"$/, '$1').replace(/""/g, '"').toLowerCase();
}

export function isBlockedSqlTableName(value: string | undefined): boolean {
  const normalized = normalizeSqlTableName(value);
  if (!normalized) {
    return true;
  }

  if (BLOCKED_SQL_TABLES.has(normalized)) {
    return true;
  }

  return BLOCKED_SQL_TABLE_PREFIXES.some((prefix) =>
    normalized === prefix || normalized.startsWith(prefix)
  );
}

export { BLOCKED_SQL_TABLES, BLOCKED_SQL_TABLE_PREFIXES };

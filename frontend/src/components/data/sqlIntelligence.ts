/**
 * sqlIntelligence.ts — Re-exports from split sub-modules.
 *
 * All pure SQL utilities live in `sqlValidation.ts` (data constants, markers, context inference)
 * and `sqlCompletions.ts` (Monaco-coupled suggestion collector).
 *
 * This barrel file preserves backward compatibility for existing imports.
 */

export {
  SQL_KEYWORDS,
  SQL_FUNCTIONS,
  SQL_SNIPPETS,
  normalizeSqlIdentifier,
  sanitizeSuggestionToken,
  resolveColumnsForTable,
  inferSqlSuggestionContext,
  getAliasBeforeDot,
  buildAliasToTableMap,
  buildSqlMarkers
} from './sqlValidation';

export type { SqlSuggestionContext } from './sqlValidation';

export { createSqlSuggestionCollector } from './sqlCompletions';

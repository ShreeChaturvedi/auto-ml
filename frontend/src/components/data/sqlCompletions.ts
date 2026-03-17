/**
 * sqlCompletions.ts — Monaco SQL completion provider helpers.
 *
 * Zero React dependencies. All exports are plain functions or constants.
 * Monaco types are imported as type-only (no runtime dependency).
 */

import type { languages } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import { quoteSqlIdentifier } from './sqlIdentifiers';
import {
  SQL_KEYWORDS,
  SQL_FUNCTIONS,
  SQL_SNIPPETS,
  resolveColumnsForTable,
  sanitizeSuggestionToken
} from './sqlValidation';

// ---------------------------------------------------------------------------
// Monaco-coupled suggestion collector (Monaco types only, no React)
// ---------------------------------------------------------------------------

type SqlCompletionRange = NonNullable<languages.CompletionItem['range']>;

export function createSqlSuggestionCollector({
  monaco,
  range,
  safeTableNames,
  columnsByTable
}: {
  monaco: Monaco;
  range: SqlCompletionRange;
  safeTableNames: string[];
  columnsByTable: Record<string, string[]>;
}) {
  const suggestions: languages.CompletionItem[] = [];

  const addKeywordSuggestions = (priority: string) => {
    SQL_KEYWORDS.forEach((keyword) => {
      suggestions.push({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        range,
        detail: 'SQL Keyword',
        sortText: `${priority}${keyword}`
      });
    });
  };

  const addFunctionSuggestions = (priority: string) => {
    SQL_FUNCTIONS.forEach((fn) => {
      suggestions.push({
        label: fn.label,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: fn.insertText,
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        detail: 'SQL Function',
        documentation: fn.documentation,
        sortText: `${priority}${fn.label}`
      });
    });
  };

  const addTableSuggestions = (priority: string) => {
    safeTableNames.forEach((tableName) => {
      const safeTableName = quoteSqlIdentifier(tableName);
      suggestions.push({
        label: tableName,
        kind: monaco.languages.CompletionItemKind.Class,
        insertText: safeTableName,
        range,
        detail: 'Table',
        documentation: `Database table: ${safeTableName}`,
        filterText: tableName,
        sortText: `${priority}${tableName}`
      });
    });
  };

  const addColumnSuggestionsForTable = (tableName: string, priority: string) => {
    const columns = resolveColumnsForTable(tableName, columnsByTable);
    columns.forEach((rawColumnName) => {
      const columnName = sanitizeSuggestionToken(rawColumnName);
      if (!columnName) {
        return;
      }

      suggestions.push({
        label: columnName,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: quoteSqlIdentifier(columnName),
        range,
        detail: `Column in ${tableName}`,
        documentation: `Column from ${tableName}`,
        filterText: columnName,
        sortText: `${priority}${tableName}.${columnName}`
      });
    });
  };

  const addSnippetSuggestions = (priority: string) => {
    SQL_SNIPPETS.forEach((snippet) => {
      suggestions.push({
        label: snippet.label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: snippet.insertText,
        insertTextRules:
          monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        documentation: snippet.documentation,
        sortText: `${priority}${snippet.label}`
      });
    });
  };

  const addBaselineSuggestions = () => {
    addSnippetSuggestions('0');
    addKeywordSuggestions('1');
    addFunctionSuggestions('2');
    addTableSuggestions('3');
    Object.keys(columnsByTable).forEach((tableName) => {
      const safeTableName = sanitizeSuggestionToken(tableName);
      if (!safeTableName) {
        return;
      }
      addColumnSuggestionsForTable(safeTableName, '4');
    });
  };

  return {
    suggestions,
    addKeywordSuggestions,
    addFunctionSuggestions,
    addTableSuggestions,
    addColumnSuggestionsForTable,
    addSnippetSuggestions,
    addBaselineSuggestions
  };
}

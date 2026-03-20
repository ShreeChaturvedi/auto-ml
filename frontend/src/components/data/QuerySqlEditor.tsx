/**
 * QuerySqlEditor - Monaco-based SQL editor with autocomplete and validation
 *
 * Extracted from QueryPanel to isolate the SQL editing surface.
 * Provides syntax highlighting, context-aware completions, and SQL linting.
 */

import { Suspense, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { LazyMonacoEditor } from '@/lib/monaco/LazyMonacoEditor';
import {
  createSqlSuggestionCollector,
  inferSqlSuggestionContext,
  buildAliasToTableMap,
  buildSqlMarkers,
  sanitizeSuggestionToken,
  getAliasBeforeDot
} from './sqlIntelligence';

// Import monaco types for completion registration
import type { IDisposable, editor as MonacoEditor } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';

export interface QuerySqlEditorProps {
  /** Current SQL query value */
  sqlQuery: string;
  /** Callback when the SQL changes */
  onQueryChange: (value: string) => void;
  /** Callback when Cmd/Ctrl+Enter is pressed */
  onExecute: () => void;
  /** Whether a query is currently executing */
  isExecuting: boolean;
  /** Monaco theme name (e.g. 'sql-dark' or 'sql-light') */
  monacoTheme: string;
  /** Table names available for autocomplete suggestions */
  tableNames: string[];
  /** Column names for autocomplete, keyed by table name */
  columnsByTable: Record<string, string[]>;
  /** Whether the panel is collapsed */
  collapsed: boolean;
  /** Whether the panel is actively expanding in width */
  isExpanding: boolean;
  /** Keyboard shortcut display string (e.g. '⌘' or '⌃') */
  modKey: string;
}

export function QuerySqlEditor({
  sqlQuery,
  onQueryChange,
  onExecute,
  isExecuting,
  monacoTheme,
  tableNames,
  columnsByTable,
  collapsed,
  isExpanding,
  modKey,
}: QuerySqlEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const editorInstanceRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const completionProviderRef = useRef<IDisposable | null>(null);
  const validationSubscriptionRef = useRef<IDisposable | null>(null);

  // Stable ref for onExecute so the Monaco keybinding always calls the latest version
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;

  // Cleanup completion provider on unmount
  useEffect(() => {
    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
      if (validationSubscriptionRef.current) {
        validationSubscriptionRef.current.dispose();
      }
      editorInstanceRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (collapsed || isExpanding) {
      return;
    }

    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      editorInstance.layout();
      secondFrame = window.requestAnimationFrame(() => {
        editorInstance.layout();
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [collapsed, isExpanding]);

  useEffect(() => {
    if (!monacoRef.current) {
      return;
    }

    monacoRef.current.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  const handleMount = useCallback(
    (editorInstance: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorInstanceRef.current = editorInstance;
      monacoRef.current = monaco;

      // Apply the preloaded SQL theme.
      monaco.editor.setTheme(monacoTheme);

      // Focus editor on mount
      editorInstance.focus();
      // Set up keyboard shortcuts
      editorInstance.addCommand(
        // Cmd/Ctrl + Enter
        (window.navigator.platform.toLowerCase().includes('mac') ? 2048 : 2176) | 3,
        () => onExecuteRef.current()
      );

      const model = editorInstance.getModel();
      if (model && model.getLanguageId() !== 'sql') {
        monaco.editor.setModelLanguage(model, 'sql');
      }

      // Clean up previous completion provider if it exists
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
      if (validationSubscriptionRef.current) {
        validationSubscriptionRef.current.dispose();
      }

      // Register context-aware SQL completion provider.
      completionProviderRef.current = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [' ', '.', ',', '"', '('],
        provideCompletionItems: (completionModel, position) => {
          const word = completionModel.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };
          const safeTableNames = tableNames
            .map((tableName) => sanitizeSuggestionToken(tableName))
            .filter((tableName): tableName is string => Boolean(tableName));
          const collector = createSqlSuggestionCollector({
            monaco,
            range,
            safeTableNames,
            columnsByTable
          });

          try {
            const textUntilPosition = completionModel.getValueInRange({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            });
            const suggestionContext = inferSqlSuggestionContext(textUntilPosition);
            const aliasToTableMap = buildAliasToTableMap(completionModel.getValue(), safeTableNames);
            const activeAlias = getAliasBeforeDot(textUntilPosition);

            if (suggestionContext === 'table') {
              collector.addTableSuggestions('0');
              collector.addKeywordSuggestions('1');
              collector.addFunctionSuggestions('2');
              collector.addSnippetSuggestions('3');
            } else if (suggestionContext === 'alias-column' && activeAlias) {
              const tableFromAlias = aliasToTableMap[activeAlias];
              if (tableFromAlias) {
                collector.addColumnSuggestionsForTable(tableFromAlias, '0');
              }
              collector.addFunctionSuggestions('1');
              collector.addKeywordSuggestions('2');
              collector.addTableSuggestions('3');
            } else {
              collector.addBaselineSuggestions();
            }
          } catch (error) {
            console.error('SQL autocomplete suggestion generation failed:', error);
          }

          if (collector.suggestions.length === 0) {
            collector.addBaselineSuggestions();
          }

          return { suggestions: collector.suggestions };
        }
      });

      if (!model) {
        return;
      }

      const validateSql = () => {
        const markers = buildSqlMarkers(model.getValue());
        monaco.editor.setModelMarkers(model, 'sql-lint', markers);
      };

      validateSql();
      validationSubscriptionRef.current = model.onDidChangeContent(() => {
        validateSql();
      });
    },
    // tableNames/columnsByTable are captured at mount time; the provider closure reads them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monacoTheme]
  );

  return (
    <div
      className="relative flex-1 overflow-hidden bg-background"
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <LazyMonacoEditor
          height="100%"
          language="sql"
          value={sqlQuery}
          onChange={(value) => onQueryChange(value || '')}
          onMount={handleMount}
          theme={monacoTheme}
          options={{
            minimap: { enabled: false },
            lineNumbers: 'on',
            lineNumbersMinChars: 2,
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 8,
            roundedSelection: false,
            scrollBeyondLastLine: false,
            readOnly: isExecuting,
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            wordWrap: 'on',
            automaticLayout: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            padding: { top: 8, bottom: 8 },
            fixedOverflowWidgets: true,
            suggest: {
              showKeywords: true,
              showSnippets: true,
              insertMode: 'replace',
              filterGraceful: true,
              localityBonus: true
            },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on'
          }}
        />
      </Suspense>
      {/* Keyboard shortcut hint */}
      <span className="absolute bottom-2 right-2 text-xs text-muted-foreground/50 pointer-events-none select-none">
        {modKey} + ⏎
      </span>
    </div>
  );
}

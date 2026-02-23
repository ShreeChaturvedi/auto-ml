/**
 * QueryPanel - Query input interface with dual-mode support
 *
 * Features:
 * - Mode toggle: English ↔ SQL (using ToggleGroup)
 * - Separate state for English and SQL inputs
 * - SQL syntax highlighting (Monaco Editor) with theme detection
 * - Default SQL template
 * - Execute button
 *
 * Design decisions documented in:
 * docs/design-system.md
 */

import { useState, useCallback, Suspense, lazy, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageSquare, Code2, PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import type { QueryMode } from '@/types/file';

// Animated lightning bolt icon for execute button
function AnimatedExecuteIcon({ isExecuting }: { isExecuting: boolean }) {
  if (isExecuting) {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }
  return (
    <svg
      className="h-4 w-4 execute-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <linearGradient id="executeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <path
        d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
        stroke="url(#executeGradient)"
        className="animate-pulse"
      />
    </svg>
  );
}

// Lazy load Monaco Editor to reduce initial bundle size
const Editor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({
    default: module.default
  }))
);

// Import monaco types for completion registration
import type { IDisposable, languages } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';

// SQL keywords for autocomplete
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN',
  'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'ON', 'AS', 'DISTINCT', 'COUNT',
  'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'NULL',
  'IS NULL', 'IS NOT NULL', 'ASC', 'DESC', 'UNION', 'UNION ALL', 'EXCEPT',
  'INTERSECT', 'EXISTS', 'ALL', 'ANY', 'WITH', 'OVER', 'PARTITION BY',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'COALESCE', 'NULLIF', 'CAST', 'CONVERT'
];

interface QueryPanelProps {
  onExecute: (query: string, mode: QueryMode) => void;
  isExecuting?: boolean;
  className?: string;
  /** Table names available for autocomplete suggestions */
  tableNames?: string[];
  /** Column names for autocomplete, keyed by table name */
  columnsByTable?: Record<string, string[]>;
  /** Whether the panel is collapsed */
  collapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapsedChange?: (collapsed: boolean) => void;
}

const DEFAULT_SQL = `-- Enter your SQL query
-- Use the table name from your uploaded dataset
-- Press Ctrl+Space for autocomplete suggestions

SELECT * FROM your_table LIMIT 100`;

const DEFAULT_ENGLISH = '';

export function QueryPanel({ 
  onExecute, 
  isExecuting = false, 
  className, 
  tableNames = [],
  columnsByTable = {},
  collapsed = false,
  onCollapsedChange
}: QueryPanelProps) {
  const [mode, setMode] = useState<QueryMode>('sql');

  // Separate state for each mode to preserve inputs when switching
  const [sqlQuery, setSqlQuery] = useState<string>(DEFAULT_SQL);
  const [englishQuery, setEnglishQuery] = useState<string>(DEFAULT_ENGLISH);

  // Theme detection for Monaco Editor
  const { theme: appTheme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');
  
  // Store completion provider disposable for cleanup
  const completionProviderRef = useRef<IDisposable | null>(null);
  
  // Cleanup completion provider on unmount
  useEffect(() => {
    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
      }
    };
  }, []);

  // Resolve system theme preference
  useEffect(() => {
    if (appTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(isDark ? 'dark' : 'light');
      
      // Listen for system theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      setResolvedTheme(appTheme as 'light' | 'dark');
    }
  }, [appTheme]);

  // Get current query based on mode
  const currentQuery = mode === 'sql' ? sqlQuery : englishQuery;

  // Handle mode toggle
  const handleModeChange = useCallback((value: string) => {
    if (value === 'sql' || value === 'english') {
      setMode(value as QueryMode);
    }
  }, []);

  // Handle query text change
  const handleQueryChange = useCallback((value: string) => {
    if (mode === 'sql') {
      setSqlQuery(value);
    } else {
      setEnglishQuery(value);
    }
  }, [mode]);

  // Handle query execution
  const handleExecute = useCallback(() => {
    if (currentQuery.trim()) {
      onExecute(currentQuery, mode);
    }
  }, [currentQuery, mode, onExecute]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl + Enter to execute
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecute();
      }
    },
    [handleExecute]
  );

  // Detect if user is on Mac for keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const modKey = isMac ? '⌘' : '⌃';

  // Collapsed state - clickable bar to expand
  if (collapsed) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onCollapsedChange?.(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCollapsedChange?.(false);
          }
        }}
        className={cn(
          'flex flex-col h-full bg-card border-l items-center py-4 transition-all duration-300 ease-in-out',
          'cursor-[w-resize] hover:bg-muted/50',
          className
        )}
        title="Expand Query Panel"
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-muted-foreground [writing-mode:vertical-lr] rotate-180">
            Query Builder
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full bg-card border-l transition-all duration-300 ease-in-out', className)}>
      {/* Header - single row with title, mode toggle, and collapse button */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground whitespace-nowrap">Query Builder</h3>

          {/* Compact Mode Toggle */}
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={handleModeChange}
            className="flex-1 bg-muted/50 p-0.5 rounded-md h-7"
          >
            <ToggleGroupItem
              value="english"
              aria-label="Natural language mode"
              className="flex-1 h-6 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm px-2"
            >
              <MessageSquare className="h-3 w-3" />
              <span className="ml-1.5">English</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="sql"
              aria-label="SQL mode"
              className="flex-1 h-6 text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm font-mono px-2"
            >
              <Code2 className="h-3 w-3" />
              <span className="ml-1.5">SQL</span>
            </ToggleGroupItem>
          </ToggleGroup>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCollapsedChange?.(true)}
            className="h-7 w-7 shrink-0"
            title="Collapse Query Panel"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Query Input */}
      <div className="flex-1 flex flex-col min-h-0 px-3 pt-3 pb-2">
        {mode === 'sql' ? (
          // SQL Mode: Monaco Editor with syntax highlighting
          <div className="relative flex-1 border rounded-md overflow-hidden bg-background">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <Editor
                height="100%"
                defaultLanguage="sql"
                value={sqlQuery}
                onChange={(value) => handleQueryChange(value || '')}
                onMount={(editorInstance, monaco: Monaco) => {
                  // Define custom dark theme matching our site
                  monaco.editor.defineTheme('custom-dark', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [
                      { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' }, // blue
                      { token: 'string', foreground: '34d399' }, // green
                      { token: 'number', foreground: 'f472b6' }, // pink
                      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' }, // gray
                      { token: 'operator', foreground: 'a78bfa' }, // purple
                      { token: 'identifier', foreground: 'fafafa' }, // white
                      { token: 'type', foreground: 'fbbf24' }, // yellow
                    ],
                    colors: {
                      'editor.background': '#000000', // Match site background
                      'editor.foreground': '#fafafa',
                      'editor.lineHighlightBackground': '#0a0a0a',
                      'editor.selectionBackground': '#2563eb44',
                      'editorLineNumber.foreground': '#404040',
                      'editorLineNumber.activeForeground': '#808080',
                      'editorGutter.background': '#000000',
                      'editor.inactiveSelectionBackground': '#1e3a5f33',
                    }
                  });

                  // Define custom light theme
                  monaco.editor.defineTheme('custom-light', {
                    base: 'vs',
                    inherit: true,
                    rules: [
                      { token: 'keyword', foreground: '2563eb', fontStyle: 'bold' },
                      { token: 'string', foreground: '059669' },
                      { token: 'number', foreground: 'db2777' },
                      { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
                      { token: 'operator', foreground: '7c3aed' },
                    ],
                    colors: {
                      'editor.background': '#ffffff',
                      'editorLineNumber.foreground': '#d4d4d4',
                      'editorLineNumber.activeForeground': '#a3a3a3',
                    }
                  });

                  // Apply the custom theme
                  monaco.editor.setTheme(resolvedTheme === 'dark' ? 'custom-dark' : 'custom-light');

                  // Focus editor on mount
                  editorInstance.focus();
                  // Set up keyboard shortcuts
                  editorInstance.addCommand(
                    // Cmd/Ctrl + Enter
                    (window.navigator.platform.toLowerCase().includes('mac') ? 2048 : 2176) | 3,
                    handleExecute
                  );

                  // Clean up previous completion provider if it exists
                  if (completionProviderRef.current) {
                    completionProviderRef.current.dispose();
                  }

                  // Register custom SQL completion provider for keywords, tables, and columns
                  completionProviderRef.current = monaco.languages.registerCompletionItemProvider('sql', {
                    triggerCharacters: [' ', '.', ','],
                    provideCompletionItems: (model, position) => {
                      const word = model.getWordUntilPosition(position);
                      const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn
                      };
                      
                      const suggestions: languages.CompletionItem[] = [];
                      
                      // Add SQL keywords with high priority
                      SQL_KEYWORDS.forEach((keyword) => {
                        suggestions.push({
                          label: keyword,
                          kind: monaco.languages.CompletionItemKind.Keyword,
                          insertText: keyword,
                          range,
                          detail: 'SQL Keyword',
                          sortText: '0' + keyword // Sort keywords first
                        });
                      });
                      
                      // Add table name suggestions
                      tableNames.forEach((tableName) => {
                        suggestions.push({
                          label: tableName,
                          kind: monaco.languages.CompletionItemKind.Class,
                          insertText: tableName,
                          range,
                          detail: 'Table',
                          documentation: `Database table: ${tableName}`,
                          sortText: '1' + tableName
                        });
                      });
                      
                      // Add column suggestions for each table
                      Object.entries(columnsByTable).forEach(([tableName, columns]) => {
                        columns.forEach((col) => {
                          suggestions.push({
                            label: col,
                            kind: monaco.languages.CompletionItemKind.Field,
                            insertText: col,
                            range,
                            detail: `Column in ${tableName}`,
                            documentation: `Column from table ${tableName}`,
                            sortText: '2' + col
                          });
                        });
                      });
                      
                      return { suggestions };
                    }
                  });
                }}
                // Use custom themes defined in onMount
                theme={resolvedTheme === 'dark' ? 'custom-dark' : 'custom-light'}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  lineNumbersMinChars: 2, // Narrower line numbers column
                  glyphMargin: false, // Remove extra glyph margin
                  folding: false, // Remove folding margin
                  lineDecorationsWidth: 8, // Spacing between line numbers and code
                  roundedSelection: false,
                  scrollBeyondLastLine: false,
                  readOnly: isExecuting,
                  fontSize: 13,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  wordWrap: 'on',
                  automaticLayout: true,
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
        ) : (
          // English Mode: Simple textarea with hint
          <div className="relative flex-1 flex flex-col">
            <Textarea
              value={englishQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to see in plain English... For example: Show me all rows where revenue is greater than 1000"
              disabled={isExecuting}
              className="flex-1 resize-none leading-relaxed focus-visible:ring-1"
              aria-label="Natural language query input"
            />
            {/* Keyboard shortcut hint */}
            <span className="absolute bottom-2 right-2 text-xs text-muted-foreground/50 pointer-events-none select-none">
              {modKey} + ⏎
            </span>
          </div>
        )}
      </div>

      {/* Execute Button */}
      <div className="px-3 pb-3">
        <Button
          variant="secondary"
          onClick={handleExecute}
          disabled={isExecuting || !currentQuery.trim()}
          className="w-full h-9 text-sm gap-2"
        >
          <AnimatedExecuteIcon isExecuting={isExecuting} />
          {isExecuting ? 'Executing...' : 'Execute'}
        </Button>
      </div>
    </div>
  );
}

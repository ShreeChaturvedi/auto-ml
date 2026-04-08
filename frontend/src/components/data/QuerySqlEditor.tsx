/**
 * QuerySqlEditor - Monaco-based SQL editor with autocomplete and validation
 *
 * Extracted from QueryPanel to isolate the SQL editing surface.
 * Provides syntax highlighting, context-aware completions, and SQL linting.
 */

import { Suspense, useEffect, useRef, useCallback, useMemo, useState } from 'react';
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
import { useWorkflowPlaceholders } from '@/hooks/useWorkflowPlaceholders';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useInsightTicker } from '@/components/ui/useInsightTicker';
import { quoteSqlIdentifier } from './sqlIdentifiers';
import { SqlPlaceholderOverlay } from './SqlPlaceholderOverlay';
import { SqlEditorChips } from './SqlEditorChips';
import { useSqlEditorIdle } from './useSqlEditorIdle';
import { assignMonacoHiddenTextareaIdentity } from '@/lib/monaco/dom';

import type { IDisposable, editor as MonacoEditor } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface QuerySqlEditorProps {
  sqlQuery: string;
  onQueryChange: (value: string) => void;
  onExecute: () => void;
  isExecuting: boolean;
  monacoTheme: string;
  tableNames: string[];
  columnsByTable: Record<string, string[]>;
  collapsed: boolean;
  isExpanding: boolean;
  modKey: string;
  projectId?: string | null;
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
  projectId,
}: QuerySqlEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const editorInstanceRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const completionProviderRef = useRef<IDisposable | null>(null);
  const validationSubscriptionRef = useRef<IDisposable | null>(null);
  const focusSubRef = useRef<IDisposable | null>(null);
  const blurSubRef = useRef<IDisposable | null>(null);
  const layoutSubRef = useRef<IDisposable | null>(null);
  const tabHandlerRef = useRef<{ domNode: HTMLElement; handler: (e: KeyboardEvent) => void } | null>(null);

  const [editorLeftOffset, setEditorLeftOffset] = useState(0);
  const [editorContentWidth, setEditorContentWidth] = useState(0);
  const { isFocused, isIdle, setFocused, onActivity } = useSqlEditorIdle();
  const prefersReducedMotion = usePrefersReducedMotion();

  // Fetch LLM-generated explore SQL placeholders
  const llmPlaceholders = useWorkflowPlaceholders(projectId ?? undefined, 'explore');

  // Shuffle once per data change using ref to avoid impure useMemo
  const placeholderKeyRef = useRef('');
  const shuffledRef = useRef<string[]>([]);
  const placeholderKey = JSON.stringify([
    llmPlaceholders,
    tableNames[0],
    columnsByTable[tableNames[0] ?? ''] ?? [],
  ]);
  if (placeholderKey !== placeholderKeyRef.current) {
    placeholderKeyRef.current = placeholderKey;
    let items: string[];
    if (llmPlaceholders.length > 0) {
      items = llmPlaceholders;
    } else {
      const table = tableNames[0];
      if (!table) { items = []; } else {
        const q = quoteSqlIdentifier(table);
        const cols = columnsByTable[table];
        const col1 = cols?.[0] ? quoteSqlIdentifier(cols[0]) : null;
        const col2 = cols?.[1] ? quoteSqlIdentifier(cols[1]) : null;
        items = [`SELECT * FROM ${q} LIMIT 100`];
        if (col1) items.push(`SELECT ${col1}, COUNT(*) FROM ${q} GROUP BY ${col1}`);
        if (col1) items.push(`SELECT * FROM ${q} WHERE ${col1} IS NOT NULL ORDER BY ${col1} DESC LIMIT 50`);
        if (col1 && col2) items.push(`SELECT ${col1}, AVG(${col2}) FROM ${q} GROUP BY ${col1}`);
      }
    }
    shuffledRef.current = shuffleArray(items);
  }
  const placeholders = shuffledRef.current;

  // Ticker state owned here so Tab handler can read currentIndex directly
  const placeholderLengths = useMemo(() => placeholders.map(p => p.length), [placeholders]);
  const {
    currentIndex,
    nextIndex,
    isAnimating,
    outgoingTransition,
    incomingTransition,
  } = useInsightTicker(placeholders.length, 4000, placeholderLengths);

  const showPlaceholder = sqlQuery === '' && !isExecuting;
  const showChips = !isFocused || isIdle;

  // Stable refs for the Tab capture handler
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;
  const tableNamesRef = useRef(tableNames);
  tableNamesRef.current = tableNames;
  const columnsByTableRef = useRef(columnsByTable);
  columnsByTableRef.current = columnsByTable;
  const showPlaceholderRef = useRef(showPlaceholder);
  showPlaceholderRef.current = showPlaceholder;
  const placeholdersRef = useRef(placeholders);
  placeholdersRef.current = placeholders;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // Cleanup all subscriptions on unmount
  useEffect(() => {
    return () => {
      completionProviderRef.current?.dispose();
      validationSubscriptionRef.current?.dispose();
      focusSubRef.current?.dispose();
      blurSubRef.current?.dispose();
      layoutSubRef.current?.dispose();
      if (tabHandlerRef.current) {
        tabHandlerRef.current.domNode.removeEventListener('keydown', tabHandlerRef.current.handler, true);
        tabHandlerRef.current = null;
      }
      editorInstanceRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (collapsed || isExpanding) return;
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;

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
    if (monacoRef.current) monacoRef.current.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  const handleMount = useCallback(
    (editorInstance: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorInstanceRef.current = editorInstance;
      monacoRef.current = monaco;
      monaco.editor.setTheme(monacoTheme);
      editorInstance.focus();

      // Cmd/Ctrl + Enter to execute
      editorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => onExecuteRef.current()
      );

      // Tab-to-accept: capture phase intercept, skips when Monaco suggest widget is open
      const domNode = editorInstance.getDomNode();
      if (domNode) {
        assignMonacoHiddenTextareaIdentity(domNode, 'query-sql-editor-ime')

        const handler = (e: KeyboardEvent) => {
          if (e.key !== 'Tab' || e.shiftKey || !showPlaceholderRef.current || placeholdersRef.current.length === 0) return;
          // Don't intercept if Monaco's suggest widget is visible
          const suggestCtrl = editorInstance.getContribution('editor.contrib.suggestController') as
            { widget?: { value?: { isVisible?: () => boolean } } } | null;
          if (suggestCtrl?.widget?.value?.isVisible?.()) return;
          e.preventDefault();
          e.stopPropagation();
          const sql = placeholdersRef.current[currentIndexRef.current] ?? placeholdersRef.current[0];
          if (sql) onQueryChangeRef.current(sql);
        };
        domNode.addEventListener('keydown', handler, true);
        tabHandlerRef.current = { domNode, handler };
      }

      // Focus/blur tracking
      focusSubRef.current?.dispose();
      blurSubRef.current?.dispose();
      focusSubRef.current = editorInstance.onDidFocusEditorText(() => {
        assignMonacoHiddenTextareaIdentity(editorInstance.getDomNode(), 'query-sql-editor-ime')
        setFocused(true)
      });
      blurSubRef.current = editorInstance.onDidBlurEditorText(() => setFocused(false));

      // Content left offset for placeholder alignment
      layoutSubRef.current?.dispose();
      const updateLayout = () => {
        const info = editorInstance.getLayoutInfo();
        setEditorLeftOffset(info.contentLeft);
        setEditorContentWidth(info.contentWidth);
      };
      updateLayout();
      layoutSubRef.current = editorInstance.onDidLayoutChange(updateLayout);

      const model = editorInstance.getModel();
      if (model && model.getLanguageId() !== 'sql') {
        monaco.editor.setModelLanguage(model, 'sql');
      }

      completionProviderRef.current?.dispose();
      validationSubscriptionRef.current?.dispose();

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
          const safeTableNames = tableNamesRef.current
            .map((tableName) => sanitizeSuggestionToken(tableName))
            .filter((tableName): tableName is string => Boolean(tableName));
          const collector = createSqlSuggestionCollector({
            monaco,
            range,
            safeTableNames,
            columnsByTable: columnsByTableRef.current,
          });

          try {
            const textUntilPosition = completionModel.getValueInRange({
              startLineNumber: 1, startColumn: 1,
              endLineNumber: position.lineNumber, endColumn: position.column
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
              if (tableFromAlias) collector.addColumnSuggestionsForTable(tableFromAlias, '0');
              collector.addFunctionSuggestions('1');
              collector.addKeywordSuggestions('2');
              collector.addTableSuggestions('3');
            } else {
              collector.addBaselineSuggestions();
            }
          } catch (error) {
            console.error('SQL autocomplete suggestion generation failed:', error);
          }

          if (collector.suggestions.length === 0) collector.addBaselineSuggestions();
          return { suggestions: collector.suggestions };
        }
      });

      if (!model) return;

      const validateSql = () => {
        const markers = buildSqlMarkers(model.getValue());
        monaco.editor.setModelMarkers(model, 'sql-lint', markers);
      };
      validateSql();
      validationSubscriptionRef.current = model.onDidChangeContent(() => validateSql());
    },
    [monacoTheme, setFocused]
  );

  const currentSql = placeholders[currentIndex] ?? '';
  const nextSql = placeholders[nextIndex] ?? '';

  return (
    <div className="relative flex-1 overflow-hidden bg-background">
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
          onChange={(value) => {
            onQueryChange(value || '');
            onActivity();
          }}
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
            overviewRulerLanes: 0,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: 'hidden', horizontal: 'hidden', alwaysConsumeMouseWheel: false },
            readOnly: isExecuting,
            fontSize: 13,
            fontFamily: '"Monaspace Neon", "JetBrains Mono", monospace',
            wordWrap: 'on',
            automaticLayout: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            padding: { top: 8, bottom: 40 },
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
      {!collapsed && showPlaceholder && (
        <SqlPlaceholderOverlay
          currentSql={currentSql}
          nextSql={nextSql}
          isAnimating={isAnimating}
          outgoingTransition={outgoingTransition}
          incomingTransition={incomingTransition}
          animateChars={isAnimating && !prefersReducedMotion}
          editorLeftOffset={editorLeftOffset}
          contentWidth={editorContentWidth}
        />
      )}
      {!collapsed && (
        <SqlEditorChips visible={showChips} modKey={modKey} />
      )}
    </div>
  );
}

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
import { Loader2, MessageSquare, Code2, PanelRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses, type ProjectColor } from '@/types/project';
import { IconModeToggle } from './IconModeToggle';
import { NlQueryWorkflow } from './NlQueryWorkflow';
import type { NlQueryWorkflowHandle, NlPhase, ApproveThemeClasses } from './NlQueryWorkflow';
import type { QueryMode } from '@/types/file';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';
import {
  createSqlSuggestionCollector,
  inferSqlSuggestionContext,
  buildAliasToTableMap,
  buildSqlMarkers,
  sanitizeSuggestionToken,
  getAliasBeforeDot
} from './sqlIntelligence';
import { AnimatedExecuteIcon, AnimatedBrainIcon } from './AnimatedQueryIcons';

const APPROVE_THEME_BY_PROJECT_COLOR: Record<ProjectColor, ApproveThemeClasses> = {
  blue: {
    hoverText: 'hover:text-blue-700 dark:hover:text-blue-300',
    hoverBorder: 'hover:border-blue-400 dark:hover:border-blue-400/70',
    hoverBg: 'hover:bg-blue-500/15 dark:hover:bg-blue-500/20'
  },
  green: {
    hoverText: 'hover:text-green-700 dark:hover:text-green-300',
    hoverBorder: 'hover:border-green-400 dark:hover:border-green-400/70',
    hoverBg: 'hover:bg-green-500/15 dark:hover:bg-green-500/20'
  },
  purple: {
    hoverText: 'hover:text-purple-700 dark:hover:text-purple-300',
    hoverBorder: 'hover:border-purple-400 dark:hover:border-purple-400/70',
    hoverBg: 'hover:bg-purple-500/15 dark:hover:bg-purple-500/20'
  },
  pink: {
    hoverText: 'hover:text-pink-700 dark:hover:text-pink-300',
    hoverBorder: 'hover:border-pink-400 dark:hover:border-pink-400/70',
    hoverBg: 'hover:bg-pink-500/15 dark:hover:bg-pink-500/20'
  },
  orange: {
    hoverText: 'hover:text-orange-700 dark:hover:text-orange-300',
    hoverBorder: 'hover:border-orange-400 dark:hover:border-orange-400/70',
    hoverBg: 'hover:bg-orange-500/15 dark:hover:bg-orange-500/20'
  },
  red: {
    hoverText: 'hover:text-red-700 dark:hover:text-red-300',
    hoverBorder: 'hover:border-red-400 dark:hover:border-red-400/70',
    hoverBg: 'hover:bg-red-500/15 dark:hover:bg-red-500/20'
  },
  yellow: {
    hoverText: 'hover:text-yellow-700 dark:hover:text-yellow-300',
    hoverBorder: 'hover:border-yellow-400 dark:hover:border-yellow-400/70',
    hoverBg: 'hover:bg-yellow-500/15 dark:hover:bg-yellow-500/20'
  },
  indigo: {
    hoverText: 'hover:text-indigo-700 dark:hover:text-indigo-300',
    hoverBorder: 'hover:border-indigo-400 dark:hover:border-indigo-400/70',
    hoverBg: 'hover:bg-indigo-500/15 dark:hover:bg-indigo-500/20'
  },
  teal: {
    hoverText: 'hover:text-teal-700 dark:hover:text-teal-300',
    hoverBorder: 'hover:border-teal-400 dark:hover:border-teal-400/70',
    hoverBg: 'hover:bg-teal-500/15 dark:hover:bg-teal-500/20'
  },
  cyan: {
    hoverText: 'hover:text-cyan-700 dark:hover:text-cyan-300',
    hoverBorder: 'hover:border-cyan-400 dark:hover:border-cyan-400/70',
    hoverBg: 'hover:bg-cyan-500/15 dark:hover:bg-cyan-500/20'
  }
};

// Lazy load Monaco Editor to reduce initial bundle size
const Editor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({
    default: module.default
  }))
);

// Import monaco types for completion registration
import type { IDisposable, editor as MonacoEditor } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';

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
  /** Current query mode (english/sql) - managed by parent */
  mode?: QueryMode;
  /** Callback when mode changes */
  onModeChange?: (mode: QueryMode) => void;
  /** Ref to the controls portal target element */
  controlsPortalTarget?: HTMLElement | null;
  /** Callback when the portal target element is mounted */
  onMountPortalTarget?: (target: HTMLElement | null) => void;
  /** Whether the panel is actively expanding in width */
  isExpanding?: boolean;
  /**
   * Async callback to generate SQL from a natural-language query.
   * Required when English mode is active with the NL workflow UI.
   */
  onNlGenerate?: (
    query: string,
    onStreamEvent?: (event: NlQueryStreamEvent) => void,
    signal?: AbortSignal
  ) => Promise<NlGenerationResult>;
  /**
   * Called when the user approves the generated (and possibly edited) SQL.
   * The parent is responsible for executing the SQL and creating an artifact.
   */
  onNlApprove?: (result: NlGenerationResult, approvedSql: string) => void;
}

const DEFAULT_SQL = `-- Enter your SQL query
-- Use the table name from your uploaded dataset
-- Wrap names with spaces in double quotes (example: "First Name")
-- Press Ctrl+Space for autocomplete suggestions

SELECT * FROM your_table LIMIT 100`;

const DEFAULT_ENGLISH = '';

function resolveEditorTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (theme !== 'system') {
    return theme;
  }

  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function QueryPanel({
  onExecute,
  isExecuting = false,
  className,
  tableNames = [],
  columnsByTable = {},
  collapsed = false,
  onCollapsedChange,
  mode: externalMode,
  onModeChange,
  controlsPortalTarget,
  onMountPortalTarget,
  isExpanding = false,
  onNlGenerate,
  onNlApprove,
}: QueryPanelProps) {
  // Use external mode if provided, otherwise use internal state
  const [internalMode, setInternalMode] = useState<QueryMode>('sql');
  const mode = externalMode ?? internalMode;

  // Separate state for each mode to preserve inputs when switching
  const [sqlQuery, setSqlQuery] = useState<string>(DEFAULT_SQL);
  const [englishQuery, setEnglishQuery] = useState<string>(DEFAULT_ENGLISH);

  // NL workflow ref & phase — phase is a local mirror updated via onPhaseChange
  // so footer buttons re-render reactively without holding workflow state here.
  const nlWorkflowRef = useRef<NlQueryWorkflowHandle>(null);
  const [nlPhase, setNlPhase] = useState<NlPhase>('idle');

  // Ref for the controls portal target div
  const controlsMountRef = useRef<HTMLDivElement>(null);

  // Keep portal target stable so tab controls don't remount/fallback while collapsing.
  useEffect(() => {
    if (!onMountPortalTarget) {
      return;
    }

    if (controlsMountRef.current && controlsMountRef.current !== controlsPortalTarget) {
      onMountPortalTarget(controlsMountRef.current);
    }
  }, [onMountPortalTarget, controlsPortalTarget]);

  const handleModeChange = useCallback(
    (nextMode: QueryMode) => {
      if (externalMode !== undefined) {
        onModeChange?.(nextMode);
        return;
      }
      setInternalMode(nextMode);
      onModeChange?.(nextMode);
    },
    [externalMode, onModeChange]
  );

  // Theme detection for Monaco Editor
  const { theme: appTheme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    resolveEditorTheme(appTheme)
  );
  const { activeProjectId, projects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const executeIconColorClass = activeProject
    ? (projectColorClasses[activeProject.color]?.text ?? 'text-primary')
    : 'text-primary';
  const approveThemeClasses = activeProject
    ? APPROVE_THEME_BY_PROJECT_COLOR[activeProject.color]
    : undefined;
  const monacoRef = useRef<Monaco | null>(null);
  const editorInstanceRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  // Store completion provider disposable for cleanup
  const completionProviderRef = useRef<IDisposable | null>(null);
  const validationSubscriptionRef = useRef<IDisposable | null>(null);
  const monacoTheme = resolvedTheme === 'dark' ? 'sql-dark' : 'sql-light';

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
    if (collapsed || isExpanding || mode !== 'sql') {
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
  }, [collapsed, isExpanding, mode]);

  // Resolve system theme preference
  useEffect(() => {
    setResolvedTheme(resolveEditorTheme(appTheme));

    if (appTheme !== 'system') {
      return;
    }

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [appTheme]);

  useEffect(() => {
    if (!monacoRef.current) {
      return;
    }

    monacoRef.current.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  const showExpandedContent = !collapsed;

  // Get current query based on mode
  const currentQuery = mode === 'sql' ? sqlQuery : englishQuery;

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

  // Detect if user is on Mac for keyboard shortcut display
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const modKey = isMac ? '⌘' : '⌃';
  const isNlGenerating = nlPhase === 'submitting' || nlPhase === 'revealing';
  const handleExpandFromCollapsed = useCallback(() => {
    onCollapsedChange?.(false);
  }, [onCollapsedChange]);

  return (
    <div className={cn('relative flex flex-col h-full bg-card border-l', className)}>
      {/* Unified Header — collapse button stays at the right edge */}
      <div className="relative flex items-center h-14 px-3 border-b border-border bg-card shrink-0">
        <div
          className={cn(
            'flex items-center gap-2 flex-1 min-w-0 pr-9 transition-opacity duration-150 ease-out',
            showExpandedContent
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
          )}
        >
            <IconModeToggle
              value={mode}
              onValueChange={(val) => {
                if (val === 'sql' || val === 'english') {
                  handleModeChange(val);
                }
              }}
              options={[
                {
                  value: 'english',
                  ariaLabel: 'Natural language mode',
                  icon: MessageSquare
                },
                {
                  value: 'sql',
                  ariaLabel: 'SQL mode',
                  icon: Code2
                }
              ]}
            />

            <div ref={controlsMountRef} className="relative flex h-7 flex-1 min-w-0 items-center" />
        </div>

        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCollapsedChange?.(!collapsed)}
                className={cn(
                  'absolute right-3 top-1/2 h-7 w-7 -translate-y-1/2 shrink-0 text-muted-foreground hover:text-foreground'
                )}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {collapsed ? 'Expand query panel' : 'Collapse query panel'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Collapsed body - always in DOM, fades via opacity to prevent layout jump */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleExpandFromCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleExpandFromCollapsed();
          }
        }}
        className={cn(
          'absolute inset-x-0 bottom-0 top-14 z-10 flex flex-col items-center py-4 cursor-[w-resize] hover:bg-muted/50 transition-opacity duration-150',
          collapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      >
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-muted-foreground [writing-mode:vertical-lr] rotate-180 select-none">
            Query Builder
          </span>
        </div>
      </div>

      {/* Query Input + Execute (kept mounted for smooth expand/collapse) */}
      <div
        className={cn(
          'flex flex-1 min-h-0 flex-col transition-opacity duration-150 ease-out',
          showExpandedContent
            ? 'opacity-100'
            : 'pointer-events-none opacity-0 select-none'
        )}
      >
        <div className="flex-1 flex flex-col min-h-0 px-3 pt-3 pb-2">
          {mode === 'sql' ? (
            // SQL Mode: Monaco Editor with syntax highlighting
            <div
              className={cn(
                'relative flex-1 rounded-md overflow-hidden bg-background',
                'border border-input transition-colors duration-200',
                'focus-within:border-ring'
              )}
            >
              <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <Editor
                height="100%"
                language="sql"
                value={sqlQuery}
                onChange={(value) => handleQueryChange(value || '')}
                onMount={(editorInstance, monaco: Monaco) => {
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
                    handleExecute
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
                    provideCompletionItems: (model, position) => {
                      const word = model.getWordUntilPosition(position);
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
                        const textUntilPosition = model.getValueInRange({
                          startLineNumber: 1,
                          startColumn: 1,
                          endLineNumber: position.lineNumber,
                          endColumn: position.column
                        });
                        const suggestionContext = inferSqlSuggestionContext(textUntilPosition);
                        const aliasToTableMap = buildAliasToTableMap(model.getValue(), safeTableNames);
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
                }}
                // Use custom themes defined in onMount
                theme={monacoTheme}
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
        ) : (
          // English Mode: NL workflow — animated input → connector → SQL reveal
          <NlQueryWorkflow
            projectId={activeProject?.id ?? activeProjectId}
            englishQuery={englishQuery}
            onQueryChange={(v) => handleQueryChange(v)}
            onGenerate={onNlGenerate ?? (() => Promise.reject(new Error('onNlGenerate not provided')))}
            onApprove={onNlApprove ?? (() => {})}
            isExpanding={isExpanding}
            onPhaseChange={setNlPhase}
            approveThemeClasses={approveThemeClasses}
            connectorColorClassName={executeIconColorClass}
            ref={nlWorkflowRef}
          />
        )}
      </div>

      {/* Execute / NL Workflow footer buttons — phase-aware */}
      <div className="px-3 pb-3">
        {mode === 'sql' ? (
          <Button
            variant="secondary"
            onClick={handleExecute}
            disabled={isExecuting || !sqlQuery.trim()}
            className="group/execute w-full h-9 text-sm gap-2"
          >
            <AnimatedExecuteIcon
              isExecuting={isExecuting}
              colorClassName={executeIconColorClass}
            />
            {isExecuting ? 'Executing...' : 'Execute'}
          </Button>
        ) : nlPhase !== 'reviewing' ? (
          /* English idle / submitting / revealing / error — trigger generation */
          <Button
            variant="secondary"
            onClick={() => nlWorkflowRef.current?.triggerGenerate()}
            disabled={
              isNlGenerating ||
              !englishQuery.trim()
            }
            className="group/execute w-full h-9 text-sm gap-2"
          >
            {isNlGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <AnimatedBrainIcon
                  colorClassName={executeIconColorClass}
                />
                Execute
              </>
            )}
          </Button>
        ) : null}
      </div>
      </div>
    </div>
  );
}

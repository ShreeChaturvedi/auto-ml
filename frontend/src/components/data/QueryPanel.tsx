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

import { useState, useCallback, Suspense, lazy, useEffect, useRef, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Code2, PanelRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses, type ProjectColor } from '@/types/project';
import { quoteSqlIdentifier } from './sqlIdentifiers';
import { IconModeToggle } from './IconModeToggle';
import { NlQueryWorkflow } from './NlQueryWorkflow';
import type { NlQueryWorkflowHandle, NlPhase, ApproveThemeClasses } from './NlQueryWorkflow';
import type { QueryMode } from '@/types/file';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';

// Generate the array of overlapping strokes for a smooth continuous gradient tail
function generateTraceLayers() {
  const layers = 20;
  const L_max = 0.5;
  const SUM = 1;
  
  return Array.from({ length: layers }).map((_, i) => {
    const length = L_max - (i * L_max / layers);
    const shift = L_max - length;

    const ratio = i / (layers - 1);
    // Dark tail in first 20%, bright head in last 80%
    const isDark = ratio < 0.2;
    const pct = isDark 
      ? 40 - (ratio / 0.2) * 40 
      : ((ratio - 0.2) / 0.8) * 100;
    
    const mixColor = isDark ? `black ${pct}%` : `white ${pct}%`;
    const color = `color-mix(in srgb, currentColor, ${mixColor})`;

    return {
      key: i,
      strokeDasharray: `${length} ${SUM - length}`,
      stroke: color,
      animationDelay: `-${(shift / SUM) * 1.5}s`
    };
  });
}

const TRACE_LAYERS = generateTraceLayers();

// Animated lightning bolt icon for execute button.
// Uses perfectly overlapping layered strokes to create a true continuous metallic gradient shine
// that flows precisely along the path contour without opacity blending or fixed-axis defects.
function AnimatedExecuteIcon({
  isExecuting,
  colorClassName
}: {
  isExecuting: boolean;
  colorClassName: string;
}) {
  if (isExecuting) {
    return <Loader2 className="h-4 w-4 animate-spin" />;
  }

  const boltPath = 'M13 2L3 14h9l-1 8 10-12h-9l1-8z';

  return (
    <svg
      className={cn('h-4 w-4 shrink-0 execute-icon', colorClassName)}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Base stroke (fully opaque) */}
      <path
        d={boltPath}
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        pathLength={1}
      />
      
      {/* Gradient shimmer: layered traces flow along the path continuously */}
      {TRACE_LAYERS.map((layer) => (
        <path
          key={layer.key}
          d={boltPath}
          fill="none"
          pathLength={1}
          className="execute-icon-trace-base"
          style={{
            stroke: layer.stroke,
            strokeDasharray: layer.strokeDasharray,
            animationDelay: layer.animationDelay
          }}
        />
      ))}
    </svg>
  );
}

// Animated brain icon for English mode execute button.
// Uses the exact same gradient tail logic to flow along each stroke.
function AnimatedBrainIcon({
  colorClassName
}: {
  colorClassName: string;
}) {
  const brainPaths = [
    'M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z',
    'M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z',
    'M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4',
    'M17.599 6.5a3 3 0 0 0 .399-1.375',
    'M6.003 5.125A3 3 0 0 0 6.401 6.5',
    'M3.477 10.896a4 4 0 0 1 .585-.396',
    'M19.938 10.5a4 4 0 0 1 .585.396',
    'M6 18a4 4 0 0 1-1.967-.516',
    'M19.967 17.484A4 4 0 0 1 18 18',
  ];

  return (
    <svg
      className={cn('h-4 w-4 shrink-0 execute-icon', colorClassName)}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Base strokes (opaque) */}
      <g stroke="currentColor">
        {brainPaths.map((d, i) => (
          <path key={`base-${i}`} d={d} pathLength={1} />
        ))}
      </g>
      
      {/* Gradient shimmer: layered traces flow along each stroke continuously */}
      <g fill="none">
        {brainPaths.map((d, pathIdx) => (
          <g key={`trace-group-${pathIdx}`}>
            {TRACE_LAYERS.map((layer) => (
              <path
                key={`trace-${pathIdx}-${layer.key}`}
                d={d}
                pathLength={1}
                className="execute-icon-trace-base"
                style={{
                  stroke: layer.stroke,
                  strokeDasharray: layer.strokeDasharray,
                  animationDelay: layer.animationDelay
                }}
              />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

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
import type { IDisposable, editor as MonacoEditor, languages } from 'monaco-editor';
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

const SQL_FUNCTIONS = [
  {
    label: 'COUNT',
    insertText: 'COUNT(${1:*})',
    documentation: 'Returns the number of input rows matching the expression.'
  },
  {
    label: 'SUM',
    insertText: 'SUM(${1:column})',
    documentation: 'Returns the sum of all non-null values.'
  },
  {
    label: 'AVG',
    insertText: 'AVG(${1:column})',
    documentation: 'Returns the average of all non-null values.'
  },
  {
    label: 'MIN',
    insertText: 'MIN(${1:column})',
    documentation: 'Returns the minimum value.'
  },
  {
    label: 'MAX',
    insertText: 'MAX(${1:column})',
    documentation: 'Returns the maximum value.'
  },
  {
    label: 'COALESCE',
    insertText: 'COALESCE(${1:value}, ${2:fallback})',
    documentation: 'Returns the first non-null argument.'
  },
  {
    label: 'DATE_TRUNC',
    insertText: "DATE_TRUNC('${1:day}', ${2:timestamp_column})",
    documentation: 'Truncates a timestamp to a specified precision.'
  }
] as const;

const SQL_SNIPPETS = [
  {
    label: 'SELECT template',
    insertText: 'SELECT ${1:*}\nFROM ${2:table_name}\nLIMIT ${3:100};',
    documentation: 'Basic SELECT query template.'
  },
  {
    label: 'JOIN template',
    insertText:
      'SELECT ${1:t1.*}, ${2:t2.*}\nFROM ${3:table_one} ${4:t1}\nJOIN ${5:table_two} ${6:t2} ON ${7:t1.id} = ${8:t2.id}\nLIMIT ${9:100};',
    documentation: 'SELECT with INNER JOIN template.'
  },
  {
    label: 'GROUP BY template',
    insertText:
      'SELECT ${1:dimension}, ${2:COUNT(*)} AS ${3:metric}\nFROM ${4:table_name}\nGROUP BY ${5:dimension}\nORDER BY ${6:metric} DESC\nLIMIT ${7:100};',
    documentation: 'Aggregation query template.'
  }
] as const;

type SqlSuggestionContext = 'table' | 'alias-column' | 'general';

function normalizeSqlIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^"(.*)"$/, '$1').replace(/""/g, '"');
}

function sanitizeSuggestionToken(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function resolveColumnsForTable(
  tableName: string,
  columnsByTable: Record<string, string[]>
): string[] {
  const normalizedTarget = normalizeSqlIdentifier(tableName).toLowerCase();
  for (const [knownTableName, columns] of Object.entries(columnsByTable)) {
    if (normalizeSqlIdentifier(knownTableName).toLowerCase() === normalizedTarget) {
      return columns;
    }
  }
  return [];
}

function inferSqlSuggestionContext(prefix: string): SqlSuggestionContext {
  const trimmed = prefix.trimEnd();
  if (/[a-zA-Z_][\w$]*\.\s*"?[\w$]*$/i.test(trimmed)) {
    return 'alias-column';
  }
  if (/\b(from|join|update|into|table)\s+"?[\w$]*$/i.test(trimmed)) {
    return 'table';
  }
  return 'general';
}

function getAliasBeforeDot(prefix: string): string | null {
  const dotMatch = prefix.match(/([a-zA-Z_][\w$]*)\.\s*"?[\w$]*$/i);
  return dotMatch?.[1]?.toLowerCase() ?? null;
}

function buildAliasToTableMap(
  sqlText: string,
  tableNames: string[]
): Record<string, string> {
  const aliasMap: Record<string, string> = {};
  const tableRefPattern =
    /\b(?:from|join)\s+((?:"[^"]+"|[a-zA-Z_][\w$]*)(?:\.(?:"[^"]+"|[a-zA-Z_][\w$]*))?)(?:\s+(?:as\s+)?([a-zA-Z_][\w$]*))?/gi;

  let match = tableRefPattern.exec(sqlText);
  while (match) {
    const rawTableRef = match[1];
    const rawAlias = match[2];
    const segments = rawTableRef
      .split('.')
      .map((segment) => normalizeSqlIdentifier(segment))
      .filter(Boolean);
    const tableToken = segments[segments.length - 1] ?? normalizeSqlIdentifier(rawTableRef);
    const resolvedTable =
      tableNames.find(
        (tableName) =>
          normalizeSqlIdentifier(tableName).toLowerCase() === tableToken.toLowerCase()
      ) ?? rawTableRef;

    aliasMap[tableToken.toLowerCase()] = resolvedTable;
    if (rawAlias) {
      aliasMap[rawAlias.toLowerCase()] = resolvedTable;
    }

    match = tableRefPattern.exec(sqlText);
  }

  return aliasMap;
}

function buildSqlMarkers(sqlText: string): MonacoEditor.IMarkerData[] {
  const markers: MonacoEditor.IMarkerData[] = [];
  const openParenStack: Array<{ lineNumber: number; column: number }> = [];
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let singleQuoteStart: { lineNumber: number; column: number } | null = null;
  let doubleQuoteStart: { lineNumber: number; column: number } | null = null;
  let lineNumber = 1;
  let column = 1;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const nextChar = sqlText[index + 1];

    if (char === '\n') {
      lineNumber += 1;
      column = 1;
      continue;
    }

    if (!inDoubleQuote && char === '\'') {
      if (inSingleQuote && nextChar === '\'') {
        index += 1;
        column += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      singleQuoteStart = inSingleQuote ? { lineNumber, column } : null;
      column += 1;
      continue;
    }

    if (!inSingleQuote && char === '"') {
      if (inDoubleQuote && nextChar === '"') {
        index += 1;
        column += 2;
        continue;
      }
      inDoubleQuote = !inDoubleQuote;
      doubleQuoteStart = inDoubleQuote ? { lineNumber, column } : null;
      column += 1;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '(') {
        openParenStack.push({ lineNumber, column });
      } else if (char === ')') {
        const openParen = openParenStack.pop();
        if (!openParen) {
          markers.push({
            severity: 8,
            message: 'Unmatched closing parenthesis',
            startLineNumber: lineNumber,
            startColumn: column,
            endLineNumber: lineNumber,
            endColumn: column + 1
          });
        }
      }
    }

    column += 1;
  }

  for (const openParen of openParenStack) {
    markers.push({
      severity: 8,
      message: 'Unclosed opening parenthesis',
      startLineNumber: openParen.lineNumber,
      startColumn: openParen.column,
      endLineNumber: openParen.lineNumber,
      endColumn: openParen.column + 1
    });
  }

  if (singleQuoteStart) {
    markers.push({
      severity: 8,
      message: 'Unclosed single quote',
      startLineNumber: singleQuoteStart.lineNumber,
      startColumn: singleQuoteStart.column,
      endLineNumber: singleQuoteStart.lineNumber,
      endColumn: singleQuoteStart.column + 1
    });
  }

  if (doubleQuoteStart) {
    markers.push({
      severity: 8,
      message: 'Unclosed double quote',
      startLineNumber: doubleQuoteStart.lineNumber,
      startColumn: doubleQuoteStart.column,
      endLineNumber: doubleQuoteStart.lineNumber,
      endColumn: doubleQuoteStart.column + 1
    });
  }

  return markers;
}

type SqlCompletionRange = NonNullable<languages.CompletionItem['range']>;

function createSqlSuggestionCollector({
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
  const iconGradientIdSeed = useId();
  const iconGradientId = `executeGradient-${iconGradientIdSeed.replace(/:/g, '')}`;
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
              gradientId={iconGradientId}
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
                  gradientId={iconGradientId}
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

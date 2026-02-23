/**
 * CodeCell - Compact code cell with Monaco editor and autosave
 *
 * Features:
 * - Autosave on blur/change (no save button)
 * - Compact header with minimal icons
 * - Custom Monaco theme (pre-loaded via @/lib/monaco/preloader)
 * - Always editable (no click-to-edit mode)
 * - No loading flash due to Monaco pre-loading
 */

import { useState, Suspense, lazy, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Play,
  Trash2,
  Copy,
  Check,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  CornerDownLeft
} from 'lucide-react';
import type { Cell } from '@/types/cell';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { CellOutputRenderer } from './CellOutputRenderer';
import type { languages, IDisposable } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import type { RichOutput } from '@/lib/api/execution';

// Lazy load Monaco Editor
const Editor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({
    default: module.default
  }))
);

// Python autocomplete items
const PYTHON_COMPLETIONS = [
  // Keywords
  ...['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
  ].map(k => ({ label: k, kind: 'keyword' as const })),
  // Builtins
  ...['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set',
    'tuple', 'bool', 'type', 'isinstance', 'open', 'sum', 'min', 'max', 'abs',
    'round', 'sorted', 'enumerate', 'zip', 'map', 'filter', 'any', 'all'
  ].map(b => ({ label: b, kind: 'function' as const })),
  // ML/DS
  ...['numpy', 'np', 'pandas', 'pd', 'DataFrame', 'Series', 'read_csv',
    'sklearn', 'train_test_split', 'fit', 'predict', 'transform',
    'matplotlib', 'plt', 'pyplot', 'figure', 'plot', 'show'
  ].map(m => ({ label: m, kind: 'module' as const }))
];

let completionProviderDisposable: IDisposable | null = null;

interface CodeCellProps {
  cell: Cell;
  cellNumber: number;
  onRun?: () => void;
  onDelete?: () => void;
  onContentChange?: (content: string) => void;
  isRunning?: boolean;
  datasetFiles?: string[];
}

export function CodeCell({
  cell,
  cellNumber,
  onRun,
  onDelete,
  onContentChange,
  isRunning,
  datasetFiles = []
}: CodeCellProps) {
  const [content, setContent] = useState(cell.content);
  const [copied, setCopied] = useState(false);
  const [showOutput, setShowOutput] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { theme: appTheme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');
  const themeDefinedRef = useRef(false);

  // Resolve theme
  useEffect(() => {
    if (appTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setResolvedTheme(isDark ? 'dark' : 'light');
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      setResolvedTheme(appTheme as 'light' | 'dark');
    }
  }, [appTheme]);

  // Sync with cell content
  useEffect(() => {
    setContent(cell.content);
  }, [cell.content]);

  // Autosave with debounce - don't save placeholder
  const PLACEHOLDER = '# Enter Python code...';

  const handleContentChange = useCallback((newContent: string) => {
    // Don't save the placeholder
    if (newContent === PLACEHOLDER) return;

    setContent(newContent);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      onContentChange?.(newContent);
    }, 500);
  }, [onContentChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Cleanup completion provider
  useEffect(() => {
    return () => {
      if (completionProviderDisposable) {
        completionProviderDisposable.dispose();
        completionProviderDisposable = null;
      }
    };
  }, []);

  const setupMonaco = (monaco: Monaco) => {
    // Themes are pre-loaded via @/lib/monaco/preloader - no need to define here
    // Just mark as ready to avoid any redundant checks
    themeDefinedRef.current = true;

    if (completionProviderDisposable) {
      completionProviderDisposable.dispose();
    }

    completionProviderDisposable = monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.', ' ', '/', '"', "'"],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        const suggestions: languages.CompletionItem[] = PYTHON_COMPLETIONS.map((item, idx) => ({
          label: item.label,
          kind: item.kind === 'keyword'
            ? monaco.languages.CompletionItemKind.Keyword
            : item.kind === 'function'
              ? monaco.languages.CompletionItemKind.Function
              : monaco.languages.CompletionItemKind.Module,
          insertText: item.label,
          range,
          sortText: String(idx).padStart(4, '0')
        }));

        // Add dataset files
        datasetFiles.forEach((file, idx) => {
          suggestions.push({
            label: file,
            kind: monaco.languages.CompletionItemKind.File,
            insertText: `/workspace/datasets/${file}`,
            range,
            detail: 'Dataset',
            sortText: `9${String(idx).padStart(3, '0')}`
          });
        });

        return { suggestions };
      }
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusIcon = () => {
    switch (cell.status) {
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const richOutputs: RichOutput[] = cell.output?.data
    ? (Array.isArray(cell.output.data) ? cell.output.data : [cell.output])
    : cell.output
      ? [{ type: cell.output.type as RichOutput['type'], content: cell.output.content }]
      : [];

  const lineCount = (content || '# Enter Python code...').split('\n').length;
  const editorHeight = Math.max(60, Math.min(300, lineCount * 18 + 16));

  return (
    <div className={cn(
      'border rounded-md overflow-hidden transition-all',
      cell.status === 'running' && 'ring-1 ring-blue-500/50',
      cell.status === 'error' && 'border-red-500/50'
    )}>
      {/* Compact header */}
      <div className="flex items-center justify-between px-2 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">
            [{cellNumber}]
          </span>
          {getStatusIcon()}
          {cell.executionDurationMs && cell.status === 'success' && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {cell.executionDurationMs}ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-2.5 w-2.5 text-green-500" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Copy</TooltipContent>
            </Tooltip>

            {onRun && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className={cn(
                      !isRunning && 'hover:bg-green-500/10 hover:text-green-600'
                    )}
                    onClick={onRun}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Play className="h-2.5 w-2.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="flex items-center gap-2 text-xs">
                  <span>Run</span>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border bg-muted/50">
                      <ArrowUp className="h-3 w-3" />
                      <span className="sr-only">Shift</span>
                    </kbd>
                    <span>+</span>
                    <kbd className="inline-flex h-5 w-5 items-center justify-center rounded border bg-muted/50">
                      <CornerDownLeft className="h-3 w-3" />
                      <span className="sr-only">Enter</span>
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="hover:bg-red-500/10 hover:text-red-500"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* Editor - always editable */}
      <div style={{ height: editorHeight }} className="transition-opacity duration-150">
        <Suspense fallback={
          <div
            className="h-full animate-pulse"
            style={{ backgroundColor: resolvedTheme === 'dark' ? '#000000' : '#ffffff' }}
          />
        }>
          <Editor
            height="100%"
            defaultLanguage="python"
            value={content}
            onChange={(value) => handleContentChange(value || '')}
            theme={resolvedTheme === 'dark' ? 'python-dark' : 'python-light'}
            onMount={(editor, monaco) => {
              setupMonaco(monaco);
              monaco.editor.setTheme(resolvedTheme === 'dark' ? 'python-dark' : 'python-light');

              // Shift+Enter to run
              editor.addCommand(
                monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                () => onRun?.()
              );
            }}
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              lineNumbersMinChars: 3,
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 8,
              scrollBeyondLastLine: false,
              fontSize: 12,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 6, bottom: 6 },
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              scrollbar: {
                vertical: 'hidden',
                horizontal: 'hidden'
              },
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
            }}
          />
        </Suspense>
      </div>

      {/* Output - compact toggle */}
      {richOutputs.length > 0 && (
        <div className="border-t">
          <div className="flex min-h-[28px] items-center justify-between px-2 py-2">
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowOutput(!showOutput)}
            >
              {showOutput ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              <span>Out</span>
            </button>
            {showOutput && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-7 w-7 p-1.5"
                onClick={async () => {
                  const text = richOutputs.map(o => o.content).join('\n');
                  await navigator.clipboard.writeText(text);
                }}
                title="Copy output"
              >
                <Copy className="h-2.5 w-2.5" />
              </Button>
            )}
          </div>

          {showOutput && (
            <div className="px-3 pb-2 text-xs font-mono">
              <CellOutputRenderer outputs={richOutputs} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * NotebookCell - Individual notebook cell with editor and output
 *
 * Features:
 * - Code/markdown editing with Monaco
 * - Custom Python theme matching site aesthetics
 * - AI lock indicator
 * - Execution status and output
 * - Autosave on blur
 * - Shift+Enter to run
 */

import { useState, useCallback, Suspense, lazy, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Play,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Bot,
  Lock,
  Eye,
  Code
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { CellOutputRenderer } from '@/components/training/CellOutputRenderer';
import type { NotebookCell, LockOwner } from '@/types/notebook';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { initMonaco } from '@/lib/monaco/preloader';
import { getPythonCompletions, type PythonCompletion } from '@/lib/api/notebooks';
import type { languages, IDisposable, editor, CancellationToken, Position } from 'monaco-editor';

// Python completion items for basic autocomplete
const PYTHON_COMPLETIONS: Array<{ label: string; kind: 'keyword' | 'function' | 'module' }> = [
  { label: 'import', kind: 'keyword' },
  { label: 'from', kind: 'keyword' },
  { label: 'def', kind: 'keyword' },
  { label: 'class', kind: 'keyword' },
  { label: 'return', kind: 'keyword' },
  { label: 'if', kind: 'keyword' },
  { label: 'elif', kind: 'keyword' },
  { label: 'else', kind: 'keyword' },
  { label: 'for', kind: 'keyword' },
  { label: 'while', kind: 'keyword' },
  { label: 'try', kind: 'keyword' },
  { label: 'except', kind: 'keyword' },
  { label: 'with', kind: 'keyword' },
  { label: 'as', kind: 'keyword' },
  { label: 'True', kind: 'keyword' },
  { label: 'False', kind: 'keyword' },
  { label: 'None', kind: 'keyword' },
  { label: 'print', kind: 'function' },
  { label: 'len', kind: 'function' },
  { label: 'range', kind: 'function' },
  { label: 'list', kind: 'function' },
  { label: 'dict', kind: 'function' },
  { label: 'str', kind: 'function' },
  { label: 'int', kind: 'function' },
  { label: 'float', kind: 'function' },
  { label: 'pandas', kind: 'module' },
  { label: 'numpy', kind: 'module' },
  { label: 'matplotlib', kind: 'module' },
  { label: 'sklearn', kind: 'module' },
  { label: 'pd', kind: 'module' },
  { label: 'np', kind: 'module' },
  { label: 'plt', kind: 'module' },
];

let completionProviderDisposable: IDisposable | null = null;
let currentProjectId: string = '';

// Lazy load Monaco
const Editor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({
    default: module.default
  }))
);

interface NotebookCellComponentProps {
  cell: NotebookCell;
  cellNumber: number;
  isLocked: boolean;
  lockOwner: LockOwner | null;
  projectId: string;
  onContentChange: (content: string) => void;
  onDelete: () => void;
  onRun: () => void;
}

export function NotebookCellComponent({
  cell,
  cellNumber,
  isLocked,
  lockOwner,
  projectId,
  onContentChange,
  onDelete,
  onRun
}: NotebookCellComponentProps) {
  const { theme } = useTheme();
  // Resolve system theme
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  const [localContent, setLocalContent] = useState(cell.content);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMarkdown = cell.cellType === 'markdown';

  // Sync local content when cell content changes from backend
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setLocalContent(cell.content);
    }
  }, [cell.content, hasUnsavedChanges]);

  // Debounced save
  const handleContentChange = useCallback(
    (value: string | undefined) => {
      const content = value ?? '';
      setLocalContent(content);
      setHasUnsavedChanges(true);

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Save after 1 second of no changes
      saveTimeoutRef.current = setTimeout(() => {
        onContentChange(content);
        setHasUnsavedChanges(false);
      }, 1000);
    },
    [onContentChange]
  );

  // Save immediately on blur
  const handleBlur = useCallback(() => {
    if (hasUnsavedChanges) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      onContentChange(localContent);
      setHasUnsavedChanges(false);
    }
  }, [hasUnsavedChanges, localContent, onContentChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const isRunning = cell.executionStatus === 'running';
  const isCode = cell.cellType === 'code';

  // Update module-level projectId for completions
  useEffect(() => {
    currentProjectId = projectId;
  }, [projectId]);

  // Convert cell.output to RichOutput format for CellOutputRenderer
  const richOutputs = cell.output.map((o) => ({
    type: o.type,
    content: o.content,
    data: o.data,
    mimeType: o.mimeType
  }));

  return (
    <div
      className={cn(
        'group rounded-lg border bg-card transition-colors',
        isLocked && lockOwner === 'ai' && 'border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/20',
        cell.executionStatus === 'error' && 'border-destructive/50',
        cell.executionStatus === 'success' && 'border-emerald-500/30'
      )}
    >
      {/* Header */}
      <div className="flex h-9 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            [{cellNumber}]
          </span>
          <Badge variant="outline" className="text-[10px]">
            {cell.cellType}
          </Badge>

          {/* AI Lock Indicator */}
          {isLocked && lockOwner === 'ai' && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] text-purple-600 border-purple-500/30 bg-purple-100/50 dark:bg-purple-900/30"
            >
              <Bot className="h-3 w-3" />
              AI editing
            </Badge>
          )}
          {isLocked && lockOwner === 'user' && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Lock className="h-3 w-3" />
              Editing
            </Badge>
          )}

          {/* Execution status */}
          {cell.executionStatus === 'success' && (
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
          )}
          {cell.executionStatus === 'error' && (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          )}
          {cell.executionStatus === 'running' && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}

          {/* Execution time */}
          {cell.executionDurationMs != null && cell.executionDurationMs > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {cell.executionDurationMs}ms
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Markdown preview/source toggle */}
          {isMarkdown && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setIsPreviewMode(!isPreviewMode)}
                    className="h-6 w-6"
                  >
                    {isPreviewMode ? (
                      <Code className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isPreviewMode ? 'Edit source' : 'Preview'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {isCode && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onRun}
                    disabled={isRunning || isLocked}
                    className="h-6 w-6"
                  >
                    {isRunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run cell</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onDelete}
                  disabled={isLocked}
                  className="h-6 w-6 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete cell</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Editor or Markdown Preview */}
      <div className="min-h-[60px]">
        {isMarkdown && isPreviewMode ? (
          /* Markdown Preview */
          <div
            className="px-4 py-3 text-sm cursor-pointer"
            onClick={() => !isLocked && setIsPreviewMode(false)}
          >
            {localContent.trim() ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
                  h1: ({ children }) => <h1 className="text-lg font-semibold mt-4 mb-2 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1.5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
                  ul: ({ children }) => <ul className="list-disc pl-4 text-sm mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 text-sm mb-2">{children}</ol>,
                  li: ({ children }) => <li className="text-sm mb-0.5">{children}</li>,
                  code: ({ className, children }) => {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-3 rounded-md overflow-x-auto text-[13px] font-mono my-2">
                        <code>{children}</code>
                      </pre>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground italic my-2">
                      {children}
                    </blockquote>
                  )
                }}
              >
                {localContent}
              </ReactMarkdown>
            ) : (
              <span className="text-muted-foreground italic">Click to edit...</span>
            )}
          </div>
        ) : (
          /* Monaco Editor */
          <Suspense
            fallback={
              <div
                className="h-[60px]"
                style={{ backgroundColor: resolvedTheme === 'dark' ? '#000000' : '#ffffff' }}
              />
            }
          >
            <Editor
              height={Math.max(60, localContent.split('\n').length * 20 + 20)}
              language={isCode ? 'python' : 'markdown'}
              value={localContent}
              onChange={handleContentChange}
              onMount={(editor, monaco) => {
                editor.onDidBlurEditorWidget(handleBlur);

                // Set custom theme
                monaco.editor.setTheme(resolvedTheme === 'dark' ? 'python-dark' : 'python-light');

                // Register completion provider (only once globally)
                if (!completionProviderDisposable) {
                  completionProviderDisposable = monaco.languages.registerCompletionItemProvider('python', {
                    triggerCharacters: ['.', ' ', '/', '"', "'", '('],
                    provideCompletionItems: async (
                      model: editor.ITextModel,
                      position: Position,
                      _context: languages.CompletionContext,
                      _token: CancellationToken
                    ): Promise<languages.CompletionList> => {
                      const word = model.getWordUntilPosition(position);
                      const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn
                      };

                      // Start with static completions
                      const staticSuggestions: languages.CompletionItem[] = PYTHON_COMPLETIONS.map((item, idx) => ({
                        label: item.label,
                        kind: item.kind === 'keyword'
                          ? monaco.languages.CompletionItemKind.Keyword
                          : item.kind === 'function'
                            ? monaco.languages.CompletionItemKind.Function
                            : monaco.languages.CompletionItemKind.Module,
                        insertText: item.label,
                        range,
                        sortText: `1${String(idx).padStart(4, '0')}`
                      }));

                      // Try to get dynamic completions from Jedi
                      // Use currentProjectId from module scope (updated by components)
                      const code = model.getValue();
                      const line = position.lineNumber;
                      const column = position.column - 1; // Jedi uses 0-based columns

                      // Skip API call if no projectId available
                      if (!currentProjectId) {
                        return { suggestions: staticSuggestions };
                      }

                      try {
                        const jediCompletions = await getPythonCompletions(code, line, column, currentProjectId);

                        const dynamicSuggestions: languages.CompletionItem[] = jediCompletions.map((comp: PythonCompletion, idx: number) => {
                          let kind: languages.CompletionItemKind;
                          switch (comp.type) {
                            case 'function':
                              kind = monaco.languages.CompletionItemKind.Function;
                              break;
                            case 'class':
                              kind = monaco.languages.CompletionItemKind.Class;
                              break;
                            case 'module':
                              kind = monaco.languages.CompletionItemKind.Module;
                              break;
                            case 'variable':
                              kind = monaco.languages.CompletionItemKind.Variable;
                              break;
                            case 'keyword':
                              kind = monaco.languages.CompletionItemKind.Keyword;
                              break;
                            case 'param':
                              kind = monaco.languages.CompletionItemKind.Variable;
                              break;
                            case 'property':
                              kind = monaco.languages.CompletionItemKind.Property;
                              break;
                            default:
                              kind = monaco.languages.CompletionItemKind.Text;
                          }

                          return {
                            label: comp.name,
                            kind,
                            insertText: comp.name,
                            range,
                            detail: comp.module ? `${comp.module}` : undefined,
                            documentation: comp.docstring || comp.signature,
                            sortText: `0${String(idx).padStart(4, '0')}` // Dynamic completions sort first
                          };
                        });

                        // Combine dynamic + static, with dynamic first
                        return { suggestions: [...dynamicSuggestions, ...staticSuggestions] };
                      } catch {
                        // Fallback to static completions only
                        return { suggestions: staticSuggestions };
                      }
                    }
                  });
                }

                // Shift+Enter to run cell
                if (isCode) {
                  editor.addCommand(
                    monaco.KeyMod.Shift | monaco.KeyCode.Enter,
                    () => onRun()
                  );
                }
              }}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 13,
                fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                lineNumbers: 'on',
                lineNumbersMinChars: 3,
                glyphMargin: false,
                folding: false,
                lineDecorationsWidth: 0,
                renderLineHighlight: 'line',
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                  vertical: 'hidden',
                  horizontal: 'hidden'
                },
                automaticLayout: true,
                padding: { top: 8, bottom: 8 },
                readOnly: isLocked,
                quickSuggestions: true,
                suggestOnTriggerCharacters: true
              }}
              theme={resolvedTheme === 'dark' ? 'python-dark' : 'python-light'}
              beforeMount={async () => {
                // Pre-load Monaco with custom themes
                await initMonaco();
              }}
            />
          </Suspense>
        )}
      </div>

      {/* Output */}
      {richOutputs.length > 0 && (
        <div className="border-t bg-muted/30 p-3">
          <CellOutputRenderer outputs={richOutputs} />
        </div>
      )}
    </div>
  );
}

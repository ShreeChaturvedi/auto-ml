import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Lock,
  Pilcrow,
  Trash2
} from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { LockOwner, NotebookCell } from '@/types/notebook';
import type { Components } from 'react-markdown';
import { initMonaco } from '@/lib/monaco/preloader';
import { LazyMonacoEditor } from '@/lib/monaco/LazyMonacoEditor';
import 'katex/dist/katex.min.css';
import { Markdown } from '@/components/ui/Markdown';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { buildHeadingComponents } from '@/lib/markdown/tocUtils';
import { MarkdownEmptyState } from './MarkdownEmptyState';

function getSectionLabel(content: string): string {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return 'Untitled section';
  }

  const heading = lines.find((line) => /^#{1,6}\s+/.test(line));
  if (heading) {
    return heading.replace(/^#{1,6}\s+/, '');
  }

  return lines[0];
}

function isEffectivelyEmpty(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  return /^#{1,6}\s*$|^[-*>]\s*$|^\d+\.\s*$/.test(trimmed);
}

const MARKDOWN_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
  lineNumbers: 'off' as const,
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 0,
  renderLineHighlight: 'none' as const,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { vertical: 'hidden' as const, horizontal: 'hidden' as const, alwaysConsumeMouseWheel: false },
  automaticLayout: true,
  padding: { top: 8, bottom: 8 },
  wordWrap: 'on' as const,
};

const NOTEBOOK_MARKDOWN_BODY_COMPONENTS: Partial<Components> = {
  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-4 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 text-sm">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5 text-sm">{children}</li>,
  code: ({ className, children }) => {
    const isInline = !className;
    if (isInline) {
      return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{children}</code>;
    }
    return (
      <pre className="my-2 overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-[13px] text-zinc-100 dark:bg-zinc-950">
        <code>{children}</code>
      </pre>
    );
  }
};

interface NotebookMarkdownCellProps {
  cell: NotebookCell;
  isLocked: boolean;
  lockOwner: LockOwner | null;
  isCollapsed: boolean;
  hiddenCodeCount: number;
  themeColor?: string;
  onToggleCollapsed: () => void;
  onContentChange: (content: string) => void;
  onDelete: () => void;
}

export function NotebookMarkdownCell({
  cell,
  isLocked,
  lockOwner,
  isCollapsed,
  hiddenCodeCount,
  themeColor,
  onToggleCollapsed,
  onContentChange,
  onDelete
}: NotebookMarkdownCellProps) {
  const { theme } = useTheme();
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  const [localContent, setLocalContent] = useState(cell.content);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(true);
  const [copied, copy] = useCopyToClipboard();
  const cellRef = useRef<HTMLDivElement>(null);
  const isExitingRef = useRef(false);
  const chipInjectedRef = useRef(false);
  const preChipContentRef = useRef('');
  const localContentRef = useRef(localContent);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { localContentRef.current = localContent; }, [localContent]);
  useEffect(() => { hasUnsavedChangesRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      setLocalContent(cell.content);
    }
  }, [cell.content, hasUnsavedChanges]);

  const handleContentChange = useCallback(
    (value: string | undefined) => {
      const content = value ?? '';
      chipInjectedRef.current = false;
      setLocalContent(content);
      setHasUnsavedChanges(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        onContentChange(content);
        setHasUnsavedChanges(false);
      }, 1000);
    },
    [onContentChange]
  );

  const handleFlushSave = useCallback(() => {
    if (!hasUnsavedChangesRef.current) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    const content = localContentRef.current.trim() === '' ? '' : localContentRef.current;
    onContentChange(content);
    setHasUnsavedChanges(false);
  }, [onContentChange]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const enterEditMode = useCallback(() => {
    if (isLocked) return;
    chipInjectedRef.current = false;
    setIsPreviewMode(false);
  }, [isLocked]);

  const enterEditModeWithContent = useCallback((scaffold: string) => {
    if (isLocked) return;
    preChipContentRef.current = localContentRef.current;
    chipInjectedRef.current = true;
    setLocalContent(scaffold);
    setHasUnsavedChanges(true);
    setIsPreviewMode(false);
  }, [isLocked]);

  const exitEditMode = useCallback(() => {
    isExitingRef.current = true;
    if (chipInjectedRef.current) {
      setLocalContent(preChipContentRef.current);
      setHasUnsavedChanges(false);
    } else {
      handleFlushSave();
    }
    chipInjectedRef.current = false;
    setIsPreviewMode(true);
  }, [handleFlushSave]);

  const exitEditModeRef = useRef(exitEditMode);
  useEffect(() => { exitEditModeRef.current = exitEditMode; }, [exitEditMode]);
  const handleFlushSaveRef = useRef(handleFlushSave);
  useEffect(() => { handleFlushSaveRef.current = handleFlushSave; }, [handleFlushSave]);

  const sectionLabel = getSectionLabel(localContent);

  const markdownComponents = useMemo(
    () => ({ ...buildHeadingComponents(`notebook-${cell.cellId}-`), ...NOTEBOOK_MARKDOWN_BODY_COMPONENTS }),
    [cell.cellId]
  );

  const handleDoubleClickEdit = useCallback(() => {
    if (window.getSelection()?.toString()) return;
    enterEditMode();
  }, [enterEditMode]);

  const handlePointerUpEdit = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') enterEditMode();
  }, [enterEditMode]);

  const handleKeyDownEdit = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      enterEditMode();
    }
  }, [enterEditMode]);

  const contentIsEmpty = useMemo(() => isEffectivelyEmpty(localContent), [localContent]);
  const isEmpty = isPreviewMode && contentIsEmpty;

  return (
    <div
      ref={cellRef}
      className={cn(
        'group rounded-md px-2 py-1 transition-colors',
        isCollapsed && 'bg-muted/20',
        isLocked && lockOwner === 'ai' && 'bg-purple-50/40 dark:bg-purple-950/20'
      )}
    >
      <div className="flex items-start gap-1">
        {/* Left icon: Pilcrow when empty, Chevron when content exists */}
        {isEmpty ? (
          <div
            className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center cursor-pointer"
            onDoubleClick={enterEditMode}
            onPointerUp={handlePointerUpEdit}
          >
            <Pilcrow className="h-5 w-5" style={themeColor ? { color: themeColor } : undefined} />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            className="mt-1 h-6 w-6 shrink-0"
            aria-label={isCollapsed ? 'Expand markdown section' : 'Collapse markdown section'}
            onClick={() => {
              exitEditMode();
              onToggleCollapsed();
            }}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        <div className="min-w-0 flex-1">
          {isCollapsed ? (
            <button
              type="button"
              className="w-full truncate pt-1 text-left text-sm font-medium text-foreground/90"
              onClick={onToggleCollapsed}
              aria-label="Expand markdown section"
            >
              {sectionLabel}
            </button>
          ) : isPreviewMode ? (
            isEmpty ? (
              <div
                className="cursor-pointer"
                onDoubleClick={enterEditMode}
                onPointerUp={handlePointerUpEdit}
                onKeyDown={handleKeyDownEdit}
                tabIndex={0}
                role="button"
                aria-label="Double-click to edit"
              >
                <MarkdownEmptyState
                  isLocked={isLocked}
                  onChipSelect={enterEditModeWithContent}
                />
              </div>
            ) : (
              <div
                className="cursor-pointer px-2 py-2 text-sm"
                onDoubleClick={handleDoubleClickEdit}
                onPointerUp={handlePointerUpEdit}
                onKeyDown={handleKeyDownEdit}
                tabIndex={0}
                role="button"
                aria-label="Double-click to edit"
              >
                <Markdown components={markdownComponents}>
                  {localContent}
                </Markdown>
              </div>
            )
          ) : (
            <Suspense
              fallback={
                <div
                  className="h-[60px]"
                  style={{ backgroundColor: resolvedTheme === 'dark' ? '#000000' : '#ffffff' }}
                />
              }
            >
                <LazyMonacoEditor
                height={Math.max(60, localContent.split('\n').length * 20 + 20)}
                language="markdown"
                value={localContent}
                onChange={handleContentChange}
                onMount={(editor, monaco) => {
                  // Escape -> exit edit mode
                  editor.addCommand(monaco.KeyCode.Escape, () => {
                    exitEditModeRef.current();
                  });

                  // Blur -> exit if focus left the cell, else just flush save
                  editor.onDidBlurEditorWidget(() => {
                    if (isExitingRef.current) {
                      isExitingRef.current = false;
                      return;
                    }
                    setTimeout(() => {
                      if (cellRef.current && !cellRef.current.contains(document.activeElement)) {
                        exitEditModeRef.current();
                      } else {
                        handleFlushSaveRef.current();
                      }
                    }, 0);
                  });

                  // Cursor positioning after chip pre-fill
                  if (chipInjectedRef.current) {
                    const model = editor.getModel();
                    if (model) {
                      const lastLine = model.getLineCount();
                      const lastCol = model.getLineLength(lastLine) + 1;
                      editor.setPosition({ lineNumber: lastLine, column: lastCol });
                    }
                    editor.focus();
                  }
                }}
                options={{ ...MARKDOWN_EDITOR_OPTIONS, readOnly: isLocked }}
                theme={resolvedTheme === 'dark' ? 'python-dark' : 'python-light'}
                beforeMount={async () => {
                  await initMonaco();
                }}
              />
            </Suspense>
          )}
        </div>

        <div className="flex items-center gap-1 pt-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <TooltipProvider>
            {!isCollapsed && !contentIsEmpty && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="h-6 w-6"
                    onClick={() => void copy(localContent)}
                    aria-label="Copy to clipboard"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? 'Copied!' : 'Copy to clipboard'}</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-6 w-6 text-foreground hover:text-destructive"
                  onClick={onDelete}
                  disabled={isLocked}
                  aria-label="Delete cell"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete cell</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="ml-7 mt-1 flex items-center gap-2">
        {isLocked && lockOwner === 'ai' && (
          <Badge
            variant="outline"
            className="gap-1 border-purple-500/30 bg-purple-100/50 text-[10px] text-purple-600 dark:bg-purple-900/30"
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
        {isCollapsed && hiddenCodeCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {hiddenCodeCount} code {hiddenCodeCount === 1 ? 'cell' : 'cells'} hidden
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * usePythonEditor — shared hook for Monaco Python editor behaviour.
 *
 * Encapsulates theme resolution, debounced autosave, content sync from props,
 * blur-save, Shift+Enter run binding, and completion-provider registration.
 * Used by both NotebookCell and CodeCell.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTheme } from '@/components/theme-provider';
import { initMonaco } from '@/lib/monaco/preloader';
import {
  registerPythonCompletionProvider,
  setCurrentProjectId,
  type CompletionProviderOptions
} from '@/lib/monaco/completionProvider';
import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';

export interface UsePythonEditorOptions {
  /** Initial / incoming cell content (kept in sync unless local edits are pending). */
  content: string;
  /** Callback fired when content should be persisted upstream. */
  onContentChange: (content: string) => void;
  /** Callback fired on Shift+Enter. */
  onRun: () => void;
  /** Autosave debounce delay in ms (default 1000). */
  autosaveDelay?: number;
  /** When true, always sync incoming content even while editing (CodeCell behaviour). */
  alwaysSync?: boolean;
  /** Content string to ignore for saves (e.g. placeholder text). */
  ignoreSaveContent?: string;
  /** Passed through to completion-provider registration. */
  completionOptions?: CompletionProviderOptions;
  /** Whether to call initMonaco() in beforeMount (default true). */
  preloadMonaco?: boolean;
}

export interface UsePythonEditorReturn {
  /** Local (possibly dirty) content to feed into the editor `value`. */
  localContent: string;
  /** Resolved theme string: 'light' | 'dark'. */
  resolvedTheme: 'light' | 'dark';
  /** Handler for the editor's `onChange` callback. */
  handleContentChange: (value: string | undefined) => void;
  /** Handler for `onMount` — wires blur, Shift+Enter, completions, theme. */
  handleEditorMount: (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => void;
  /** Async function for `beforeMount` (preloads Monaco when enabled). */
  handleBeforeMount: () => Promise<void>;
}

export function usePythonEditor({
  content,
  onContentChange,
  onRun,
  autosaveDelay = 1000,
  alwaysSync = false,
  ignoreSaveContent,
  completionOptions = {},
  preloadMonaco = true
}: UsePythonEditorOptions): UsePythonEditorReturn {
  const { theme } = useTheme();
  const resolvedTheme: 'light' | 'dark' =
    theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (theme as 'light' | 'dark');

  const [localContent, setLocalContent] = useState(content);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep latest callbacks in refs so mount handler closure stays stable.
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  // Sync incoming content when there are no local unsaved changes.
  useEffect(() => {
    if (alwaysSync || !hasUnsavedChanges) {
      setLocalContent(content);
    }
  }, [content, hasUnsavedChanges, alwaysSync]);

  // Keep projectId in sync for Jedi completions.
  useEffect(() => {
    if (completionOptions.projectId) {
      setCurrentProjectId(completionOptions.projectId);
    }
  }, [completionOptions.projectId]);

  // Cleanup save timeout on unmount.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // --- onChange handler (debounced autosave) ---------------------------------
  const handleContentChange = useCallback(
    (value: string | undefined) => {
      const newContent = value ?? '';

      // Skip saving placeholder text.
      if (ignoreSaveContent && newContent === ignoreSaveContent) return;

      setLocalContent(newContent);
      setHasUnsavedChanges(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        onContentChangeRef.current(newContent);
        setHasUnsavedChanges(false);
      }, autosaveDelay);
    },
    [autosaveDelay, ignoreSaveContent]
  );

  // --- onMount handler ------------------------------------------------------
  const handleEditorMount = useCallback(
    (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      // Blur → flush unsaved changes.
      editor.onDidBlurEditorWidget(() => {
        // Inline the flush logic to capture latest localContent via ref-like
        // access through the editor's own model value.
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        const currentValue = editor.getModel()?.getValue() ?? '';
        if (ignoreSaveContent && currentValue === ignoreSaveContent) return;
        onContentChangeRef.current(currentValue);
        setHasUnsavedChanges(false);
      });

      // Apply theme.
      monaco.editor.setTheme(resolvedTheme === 'dark' ? 'python-dark' : 'python-light');

      // Register completion provider.
      registerPythonCompletionProvider(monaco, completionOptions);

      // Shift+Enter → run.
      editor.addCommand(
        monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => onRunRef.current()
      );
    },
    // We intentionally keep a minimal dep list; callbacks are captured via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme, completionOptions.projectId]
  );

  // --- beforeMount handler --------------------------------------------------
  const handleBeforeMount = useCallback(async () => {
    if (preloadMonaco) {
      await initMonaco();
    }
  }, [preloadMonaco]);

  return {
    localContent,
    resolvedTheme,
    handleContentChange,
    handleEditorMount,
    handleBeforeMount
  };
}

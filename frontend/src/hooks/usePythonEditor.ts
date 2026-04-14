/**
 * usePythonEditor — shared hook for Monaco Python editor behaviour.
 *
 * Encapsulates theme resolution, debounced autosave, content sync from props,
 * blur-save, Shift+Enter run binding, and completion-provider registration.
 * Used by both NotebookCell and CodeCell.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import type { SyntaxThemeId } from '@/lib/color/syntaxPalette';
import { useTheme } from '@/components/theme-provider';
import { initMonaco } from '@/lib/monaco/preloader';
import {
  registerPythonCompletionProvider,
  setCurrentProjectId,
  type CompletionProviderOptions
} from '@/lib/monaco/completionProvider';
import { registerModelCellId, unregisterModelCellId } from '@/lib/monaco/notebookContext';
import { attachDiagnostics } from '@/lib/monaco/pythonProviders';
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
  /** Syntax theme ID for Monaco (e.g. 'adaptive-dark', 'static-light'). */
  syntaxThemeId: SyntaxThemeId;
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
  const { resolvedTheme } = useTheme();
  const { syntaxThemeId } = useProjectThemeColor();

  const [localContent, setLocalContent] = useState(content);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const localContentRef = useRef(content);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const diagnosticsRef = useRef<{ dispose(): void } | null>(null);
  // Keep latest callbacks in refs so mount handler closure stays stable.
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  // Sync incoming content — only overwrite local when safe to do so.
  useEffect(() => {
    if (alwaysSync) {
      setLocalContent(content);
      localContentRef.current = content;
      return;
    }
    if (hasUnsavedChanges) {
      // Prop caught up to local → save acknowledged via WebSocket round-trip.
      if (content === localContentRef.current) {
        setHasUnsavedChanges(false);
      }
    } else {
      // No local edits — sync from prop if it changed externally.
      if (content !== localContentRef.current) {
        setLocalContent(content);
        localContentRef.current = content;
      }
    }
  }, [content, hasUnsavedChanges, alwaysSync]);

  // Keep projectId in sync for Jedi completions.
  useEffect(() => {
    if (completionOptions.projectId) {
      setCurrentProjectId(completionOptions.projectId);
    }
  }, [completionOptions.projectId]);

  // Cleanup save timeout, diagnostics, and model registration on unmount.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (diagnosticsRef.current) {
        diagnosticsRef.current.dispose();
        diagnosticsRef.current = null;
      }
      if (editorRef.current && completionOptions.cellId) {
        const uri = editorRef.current.getModel()?.uri.toString();
        if (uri) unregisterModelCellId(uri);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- onChange handler (debounced autosave) ---------------------------------
  const handleContentChange = useCallback(
    (value: string | undefined) => {
      const newContent = value ?? '';

      // Skip saving placeholder text.
      if (ignoreSaveContent && newContent === ignoreSaveContent) return;

      setLocalContent(newContent);
      localContentRef.current = newContent;
      setHasUnsavedChanges(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        onContentChangeRef.current(newContent);
      }, autosaveDelay);
    },
    [autosaveDelay, ignoreSaveContent]
  );

  // --- onMount handler ------------------------------------------------------
  const handleEditorMount = useCallback(
    (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor;

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
      });

      // Apply theme.
      monaco.editor.setTheme(syntaxThemeId);

      // Register completion provider.
      registerPythonCompletionProvider(monaco, completionOptions);

      // Register model-to-cell mapping for notebook context.
      if (completionOptions.cellId) {
        registerModelCellId(editor.getModel()!.uri.toString(), completionOptions.cellId);
      }

      // Attach per-editor diagnostics.
      if (completionOptions.projectId) {
        diagnosticsRef.current = attachDiagnostics(monaco, editor, completionOptions.projectId);
      }

      // Shift+Enter → run.
      editor.addCommand(
        monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        () => onRunRef.current()
      );
    },
    // We intentionally keep a minimal dep list; callbacks are captured via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syntaxThemeId, completionOptions.projectId, completionOptions.cellId]
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
    syntaxThemeId,
    handleContentChange,
    handleEditorMount,
    handleBeforeMount
  };
}

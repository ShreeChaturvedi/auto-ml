/**
 * Python Providers — Completion, Hover, Signature Help & Diagnostics
 *
 * Manages registration and disposal of all Python intellisense providers
 * for Monaco editors. Uses Jedi (via backend) for dynamic completions
 * and multi-cell notebook context for cross-cell awareness.
 */

import type { languages, IDisposable, editor, Position, CancellationToken } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import { PYTHON_COMPLETIONS } from './pythonCompletions';
import {
  getPythonCompletions,
  getPythonHover,
  getPythonSignatures,
  getPythonDiagnostics,
  type PythonCompletion
} from '@/lib/api/notebooks';
import { buildNotebookContext } from './notebookContext';

let completionDisposable: IDisposable | null = null;
let hoverDisposable: IDisposable | null = null;
let signatureDisposable: IDisposable | null = null;
let currentProjectId = '';
let currentDatasetFiles: string[] = [];

/** Keep the captured projectId in sync for requests. */
export function setCurrentProjectId(id: string): void {
  currentProjectId = id;
}

export interface CompletionProviderOptions {
  projectId?: string;
  datasetFiles?: string[];
  cellId?: string;
}

/**
 * Register all Python intellisense providers on the given Monaco instance.
 * Providers are global singletons — registered once, with module-level state
 * (currentProjectId, currentDatasetFiles) read at request time.
 */
export function registerPythonProviders(
  monaco: Monaco,
  options: CompletionProviderOptions = {}
): void {
  const { projectId, datasetFiles = [] } = options;

  if (projectId) {
    currentProjectId = projectId;
  }
  currentDatasetFiles = datasetFiles;

  // Already registered — providers read module-level state, no re-registration needed.
  if (completionDisposable) return;

  // -----------------------------------------------------------------
  // Completion Provider
  // -----------------------------------------------------------------
  completionDisposable = monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.', ' ', '/', '"', "'", '('],
    provideCompletionItems: async (
      model: editor.ITextModel,
      position: Position
    ): Promise<languages.CompletionList> => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      // Detect dot-access context (e.g. `pd.`, `name.`) — static suggestions
      // are irrelevant when completing object attributes.
      const lineContent = model.getLineContent(position.lineNumber);
      const charBeforeWord = word.startColumn > 1 ? lineContent[word.startColumn - 2] : '';
      const isDotAccess = charBeforeWord === '.';

      // --- Static suggestions (skip entirely for dot-access) -----------------
      const staticSuggestions: languages.CompletionItem[] = [];
      if (!isDotAccess) {
        PYTHON_COMPLETIONS.forEach((item, idx) => {
          staticSuggestions.push({
            label: item.label,
            kind: item.kind === 'keyword'
              ? monaco.languages.CompletionItemKind.Keyword
              : item.kind === 'function'
                ? monaco.languages.CompletionItemKind.Function
                : monaco.languages.CompletionItemKind.Module,
            insertText: item.label,
            range,
            sortText: `1${String(idx).padStart(4, '0')}`
          });
        });

        currentDatasetFiles.forEach((file, idx) => {
          staticSuggestions.push({
            label: file,
            kind: monaco.languages.CompletionItemKind.File,
            insertText: `/workspace/datasets/${file}`,
            range,
            detail: 'Dataset',
            sortText: `9${String(idx).padStart(3, '0')}`
          });
        });
      }

      // --- Dynamic Jedi suggestions (notebook only) --------------------------
      if (currentProjectId) {
        try {
          const code = model.getValue();
          const line = position.lineNumber;
          const column = position.column - 1;
          const { cells, currentCellId } = buildNotebookContext(model.uri.toString());
          const jediCompletions = await getPythonCompletions(
            code, line, column, currentProjectId, cells, currentCellId
          );

          const dynamicSuggestions: languages.CompletionItem[] = jediCompletions.map(
            (comp: PythonCompletion, idx: number) => {
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
                sortText: `0${String(idx).padStart(4, '0')}`
              };
            }
          );

          return { suggestions: [...dynamicSuggestions, ...staticSuggestions] };
        } catch {
          return { suggestions: staticSuggestions };
        }
      }

      return { suggestions: staticSuggestions };
    }
  });

  // -----------------------------------------------------------------
  // Hover Provider
  // -----------------------------------------------------------------
  hoverDisposable = monaco.languages.registerHoverProvider('python', {
    provideHover: async (
      model: editor.ITextModel,
      position: Position,
      token: CancellationToken
    ): Promise<languages.Hover | null> => {
      if (token.isCancellationRequested) return null;
      if (!currentProjectId) return null;

      const code = model.getValue();
      const line = position.lineNumber;
      const column = position.column - 1;
      const { cells, currentCellId } = buildNotebookContext(model.uri.toString());

      const result = await getPythonHover(code, line, column, currentProjectId, cells, currentCellId);
      if (!result) return null;

      // Build markdown contents
      let markdownString = `**${result.type}** \`${result.fullName || result.name}\``;
      if (result.docstring) {
        markdownString += `\n\n${result.docstring}`;
      }

      // Get word range at position
      const wordAtPosition = model.getWordAtPosition(position);
      const range = wordAtPosition
        ? {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: wordAtPosition.startColumn,
            endColumn: wordAtPosition.endColumn
          }
        : {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column
          };

      return {
        contents: [{ value: markdownString }],
        range
      };
    }
  });

  // -----------------------------------------------------------------
  // Signature Help Provider
  // -----------------------------------------------------------------
  signatureDisposable = monaco.languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp: async (
      model: editor.ITextModel,
      position: Position,
      token: CancellationToken
    ): Promise<languages.SignatureHelpResult | null> => {
      if (token.isCancellationRequested) return null;
      if (!currentProjectId) return null;

      const code = model.getValue();
      const line = position.lineNumber;
      const column = position.column - 1;
      const { cells, currentCellId } = buildNotebookContext(model.uri.toString());

      const results = await getPythonSignatures(code, line, column, currentProjectId, cells, currentCellId);
      if (!results || results.length === 0) return null;

      const signatures: languages.SignatureInformation[] = results.map((sig) => ({
        label: `${sig.name}(${sig.params.map((p) => p.name).join(', ')})`,
        documentation: sig.docstring,
        parameters: sig.params.map((p) => ({
          label: p.name,
          documentation: p.description
        }))
      }));

      return {
        value: {
          signatures,
          activeSignature: 0,
          activeParameter: results[0].activeParam
        },
        dispose: () => {}
      };
    }
  });
}

/**
 * Dispose all active Python intellisense providers (for cleanup on unmount).
 */
export function disposePythonProviders(): void {
  if (completionDisposable) {
    completionDisposable.dispose();
    completionDisposable = null;
  }
  if (hoverDisposable) {
    hoverDisposable.dispose();
    hoverDisposable = null;
  }
  if (signatureDisposable) {
    signatureDisposable.dispose();
    signatureDisposable = null;
  }
}

/**
 * Attach per-editor Python diagnostics (lint markers).
 *
 * Creates a debounced listener on the editor's model content changes
 * that fetches diagnostics from the backend and sets Monaco markers.
 *
 * Returns an IDisposable that cleans up the timer, markers, and
 * content-change subscription.
 */
export function attachDiagnostics(
  monaco: Monaco,
  editorInstance: editor.IStandaloneCodeEditor,
  projectId: string
): IDisposable {
  const model = editorInstance.getModel();
  if (!model) {
    return { dispose: () => {} };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const runDiagnostics = async () => {
    if (cancelled) return;

    const code = model.getValue();
    const { cells, currentCellId } = buildNotebookContext(model.uri.toString());

    try {
      const diagnostics = await getPythonDiagnostics(
        code, 1, 0, projectId, cells, currentCellId
      );

      if (cancelled) return;

      const markers: editor.IMarkerData[] = diagnostics.map((d) => ({
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.endLine,
        endColumn: d.endColumn,
        message: d.message,
        severity: monaco.MarkerSeverity.Error
      }));

      monaco.editor.setModelMarkers(model, 'python-diagnostics', markers);
    } catch {
      // Silently ignore diagnostic failures
    }
  };

  const subscription = model.onDidChangeContent(() => {
    if (timer) {
      clearTimeout(timer);
    }
    cancelled = false;
    timer = setTimeout(runDiagnostics, 800);
  });

  return {
    dispose: () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      monaco.editor.setModelMarkers(model, 'python-diagnostics', []);
      subscription.dispose();
    }
  };
}

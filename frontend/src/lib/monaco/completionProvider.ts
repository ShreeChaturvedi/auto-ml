/**
 * Shared Monaco Python completion-provider registration.
 *
 * Manages a singleton `IDisposable` so only one provider is active at a time,
 * and supports optional Jedi (dynamic) completions and dataset-file suggestions.
 */

import type { languages, IDisposable, editor, Position } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import { PYTHON_COMPLETIONS } from './pythonCompletions';
import { getPythonCompletions, type PythonCompletion } from '@/lib/api/notebooks';

let completionProviderDisposable: IDisposable | null = null;
let currentProjectId = '';

/** Keep the captured projectId in sync for Jedi requests. */
export function setCurrentProjectId(id: string): void {
  currentProjectId = id;
}

export interface CompletionProviderOptions {
  /** When set, dynamic Jedi completions are fetched via the backend. */
  projectId?: string;
  /** Optional list of dataset filenames to offer as path completions. */
  datasetFiles?: string[];
}

/**
 * Register (or re-register) the Python completion provider on the given
 * Monaco instance.  Only one provider is kept alive at a time.
 */
export function registerPythonCompletionProvider(
  monaco: Monaco,
  options: CompletionProviderOptions = {}
): void {
  const { projectId, datasetFiles = [] } = options;

  if (projectId) {
    currentProjectId = projectId;
  }

  // Dispose any previous provider before registering a new one.
  if (completionProviderDisposable) {
    completionProviderDisposable.dispose();
    completionProviderDisposable = null;
  }

  const useJedi = !!projectId;

  completionProviderDisposable = monaco.languages.registerCompletionItemProvider('python', {
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

      // --- Static suggestions ---------------------------------------------------
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

      // --- Dataset-file suggestions ---------------------------------------------
      datasetFiles.forEach((file, idx) => {
        staticSuggestions.push({
          label: file,
          kind: monaco.languages.CompletionItemKind.File,
          insertText: `/workspace/datasets/${file}`,
          range,
          detail: 'Dataset',
          sortText: `9${String(idx).padStart(3, '0')}`
        });
      });

      // --- Dynamic Jedi suggestions (notebook only) -----------------------------
      if (useJedi && currentProjectId) {
        try {
          const code = model.getValue();
          const line = position.lineNumber;
          const column = position.column - 1;
          const jediCompletions = await getPythonCompletions(code, line, column, currentProjectId);

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
}

/**
 * Dispose the active completion provider (for cleanup on unmount).
 */
export function disposeCompletionProvider(): void {
  if (completionProviderDisposable) {
    completionProviderDisposable.dispose();
    completionProviderDisposable = null;
  }
}

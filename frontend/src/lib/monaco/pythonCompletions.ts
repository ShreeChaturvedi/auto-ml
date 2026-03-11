/**
 * Static Python completion items used by both NotebookCell and CodeCell editors.
 *
 * This is the merged superset of keywords, builtins, and ML/DS modules from
 * both components so that every Python editor surface offers the same baseline.
 */

export interface PythonCompletionItem {
  label: string;
  kind: 'keyword' | 'function' | 'module';
}

export const PYTHON_COMPLETIONS: PythonCompletionItem[] = [
  // Keywords (union of both lists)
  ...([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
  ] as const).map(k => ({ label: k, kind: 'keyword' as const })),

  // Builtins
  ...([
    'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set',
    'tuple', 'bool', 'type', 'isinstance', 'open', 'sum', 'min', 'max', 'abs',
    'round', 'sorted', 'enumerate', 'zip', 'map', 'filter', 'any', 'all'
  ] as const).map(b => ({ label: b, kind: 'function' as const })),

  // ML / Data-science modules & common aliases
  ...([
    'numpy', 'np', 'pandas', 'pd', 'DataFrame', 'Series', 'read_csv',
    'sklearn', 'train_test_split', 'fit', 'predict', 'transform',
    'matplotlib', 'plt', 'pyplot', 'figure', 'plot', 'show'
  ] as const).map(m => ({ label: m, kind: 'module' as const }))
];

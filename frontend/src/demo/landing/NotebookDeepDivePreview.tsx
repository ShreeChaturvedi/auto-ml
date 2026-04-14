import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Check, Copy, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CellOutputRenderer } from '@/components/training/CellOutputRenderer';
import { buildOutputCopyText } from '@/components/training/cellOutputUtils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getEditorChromeColors } from '@/lib/color/editorColors';
import { computeSyntaxPalette, setSynVarsFromPalette } from '@/lib/color/syntaxPalette';

import type { RichOutput } from '@/lib/api/execution';
import type { CellOutput, NotebookCell } from '@/types/notebook';

const NOW = '2026-04-13T15:30:00.000Z';
const NOTEBOOK_ID = 'landing-standalone-notebook';
const NOTEBOOK_SYNTAX_HUE = 240;
const NOTEBOOK_EDITOR_CHROME = getEditorChromeColors(true);

const DESCRIBE_TABLE = {
  columns: ['stat', 'mrr_usd', 'avg_session_minutes', 'api_calls'],
  rows: [
    { stat: 'count', mrr_usd: '2,530', avg_session_minutes: '2,280', api_calls: '2,530' },
    { stat: 'mean', mrr_usd: '2,142', avg_session_minutes: '18.4', api_calls: '12,004' },
    { stat: 'std', mrr_usd: '1,854', avg_session_minutes: '12.7', api_calls: '28,312' },
    { stat: 'min', mrr_usd: '0', avg_session_minutes: '0.3', api_calls: '0' },
    { stat: '50%', mrr_usd: '1,620', avg_session_minutes: '15.2', api_calls: '3,412' },
    { stat: 'max', mrr_usd: '24,180', avg_session_minutes: '84.1', api_calls: '892,448' },
  ],
};

const CELLS: NotebookCell[] = [
  {
    cellId: 'landing-notebook-cell-1',
    notebookId: NOTEBOOK_ID,
    cellType: 'code',
    content: [
      'import pandas as pd',
      '',
      "df = pd.read_csv('customers.csv')",
      '',
      "summary = df[['mrr_usd', 'avg_session_minutes', 'api_calls']].describe()",
      'summary',
    ].join('\n'),
    position: 0,
    metadata: {},
    executionCount: 1,
    executionOrder: 1,
    executionStatus: 'success',
    executionDurationMs: 210,
    executedAt: NOW,
    isDirty: false,
    output: [
      {
        type: 'table',
        content: 'describe() summary',
        data: DESCRIBE_TABLE,
      },
    ],
    outputRefs: [],
    lockedBy: null,
    lockedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export function NotebookDeepDivePreview() {
  const previewRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!previewRef.current) {
      return;
    }

    setSynVarsFromPalette(previewRef.current, computeSyntaxPalette(NOTEBOOK_SYNTAX_HUE, true));
  }, []);

  return (
    <div ref={previewRef} className="flex h-full flex-col gap-3 overflow-auto p-4">
      {CELLS.map((cell) => (
        <LandingNotebookCell
          key={cell.cellId}
          cell={cell}
          editorChromeColors={NOTEBOOK_EDITOR_CHROME}
        />
      ))}
    </div>
  );
}

function LandingNotebookCell({
  cell,
  editorChromeColors,
}: {
  cell: NotebookCell;
  editorChromeColors: ReturnType<typeof getEditorChromeColors>;
}) {
  const lines = cell.content.split('\n');
  const editorTextStyle = useMemo<CSSProperties>(
    () => ({ color: editorChromeColors.foreground }),
    [editorChromeColors.foreground],
  );
  const lineNumberStyle = useMemo<CSSProperties>(
    () => ({ color: editorChromeColors.lineNumber }),
    [editorChromeColors.lineNumber],
  );
  const codeSurfaceStyle = useMemo<CSSProperties>(
    () => ({ backgroundColor: editorChromeColors.background }),
    [editorChromeColors.background],
  );

  return (
    <div className="group overflow-hidden rounded-lg border border-border bg-card transition-colors duration-150">
      <div className="flex h-9 items-center justify-between border-b px-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-foreground"
            aria-label="Run cell"
            tabIndex={-1}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <span className="font-mono text-xs text-muted-foreground">
            {cell.executionOrder != null ? `[${cell.executionOrder}]` : '[ ]'}
          </span>
          {cell.executionDurationMs != null && cell.executionDurationMs > 0 ? (
            <span className="text-xs text-muted-foreground/60">
              · {formatExecutionDuration(cell.executionDurationMs)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto" style={codeSurfaceStyle}>
        <div className="min-w-full px-3 py-2 font-mono text-[13px] leading-6">
          {lines.map((line, index) => (
            <div
              key={`${cell.cellId}-${index}`}
              className="grid min-w-full grid-cols-[auto_1fr] gap-x-3"
            >
              <span className="select-none text-right text-xs" style={lineNumberStyle}>
                {index + 1}
              </span>
              <span className="whitespace-pre" style={editorTextStyle}>
                {line.length > 0 ? renderPythonLine(line, `${cell.cellId}-${index}`) : ' '}
              </span>
            </div>
          ))}
        </div>
      </div>

      <LandingNotebookOutput outputs={cell.output} />
    </div>
  );
}

function LandingNotebookOutput({ outputs }: { outputs: CellOutput[] }) {
  const [outputCopied, copyOutput] = useCopyToClipboard();

  const handleCopyOutput = async () => {
    const text = buildOutputCopyText(outputs as RichOutput[]);
    if (text) {
      await copyOutput(text);
    }
  };

  if (outputs.length === 0) {
    return null;
  }

  return (
    <div className="border-t bg-muted/30">
      <div className="flex min-h-[32px] items-center justify-between border-b px-3 py-1.5">
        <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">
          OUTPUT
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-6 w-6 [&_svg]:scale-[0.92]"
          onClick={() => void handleCopyOutput()}
          aria-label={outputCopied ? 'Copied output!' : 'Copy output'}
          type="button"
        >
          {outputCopied ? (
            <Check className="text-green-500" />
          ) : (
            <Copy />
          )}
        </Button>
      </div>
      <div className="p-3">
        <CellOutputRenderer outputs={outputs as RichOutput[]} />
      </div>
    </div>
  );
}

function formatExecutionDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

type PythonTokenType =
  | 'keyword'
  | 'function'
  | 'string'
  | 'number'
  | 'comment'
  | 'operator'
  | 'punctuation'
  | 'identifier'
  | 'whitespace';

type PythonToken = {
  text: string;
  type: PythonTokenType;
};

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with',
  'yield',
]);

const MULTI_CHAR_OPERATORS = new Set([
  '==', '!=', '<=', '>=', '//', '**', '+=', '-=', '*=', '/=', '%=', '->',
]);

const PUNCTUATION_CHARS = new Set(['(', ')', '[', ']', '{', '}', '.', ',', ':']);

const TOKEN_STYLE_BY_TYPE: Partial<Record<Exclude<PythonTokenType, 'whitespace'>, CSSProperties>> = {
  keyword: { color: 'hsl(var(--syn-keyword))', fontWeight: 600 },
  function: { color: 'hsl(var(--syn-function))' },
  string: { color: 'hsl(var(--syn-string))' },
  number: { color: 'hsl(var(--syn-number))' },
  comment: { color: 'hsl(var(--syn-comment))', fontStyle: 'italic' },
};

function renderPythonLine(line: string, keyPrefix: string) {
  return tokenizePythonLine(line).map((token, index) => {
    const style = token.type === 'whitespace' ? undefined : TOKEN_STYLE_BY_TYPE[token.type];

    if (!style) {
      return (
        <span key={`${keyPrefix}-${index}`}>
          {token.text}
        </span>
      );
    }

    return (
      <span
        key={`${keyPrefix}-${index}`}
        style={style}
      >
        {token.text}
      </span>
    );
  });
}

function tokenizePythonLine(line: string): PythonToken[] {
  const tokens: PythonToken[] = [];
  let index = 0;

  while (index < line.length) {
    const char = line[index];

    if (/\s/.test(char)) {
      let end = index + 1;
      while (end < line.length && /\s/.test(line[end])) end += 1;
      tokens.push({ text: line.slice(index, end), type: 'whitespace' });
      index = end;
      continue;
    }

    if (char === '#') {
      tokens.push({ text: line.slice(index), type: 'comment' });
      break;
    }

    if (char === '"' || char === '\'') {
      let end = index + 1;
      while (end < line.length) {
        if (line[end] === '\\') {
          end += 2;
          continue;
        }
        if (line[end] === char) {
          end += 1;
          break;
        }
        end += 1;
      }
      tokens.push({ text: line.slice(index, end), type: 'string' });
      index = end;
      continue;
    }

    if (/\d/.test(char)) {
      let end = index + 1;
      while (end < line.length && /[\d._]/.test(line[end])) end += 1;
      tokens.push({ text: line.slice(index, end), type: 'number' });
      index = end;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (end < line.length && /[A-Za-z0-9_]/.test(line[end])) end += 1;
      const word = line.slice(index, end);
      const nextIndex = skipWhitespace(line, end);
      const type: PythonTokenType = PYTHON_KEYWORDS.has(word)
        ? 'keyword'
        : line[nextIndex] === '('
          ? 'function'
          : 'identifier';
      tokens.push({ text: word, type });
      index = end;
      continue;
    }

    const pair = line.slice(index, index + 2);
    if (MULTI_CHAR_OPERATORS.has(pair)) {
      tokens.push({ text: pair, type: 'operator' });
      index += 2;
      continue;
    }

    if (PUNCTUATION_CHARS.has(char)) {
      tokens.push({ text: char, type: 'punctuation' });
      index += 1;
      continue;
    }

    tokens.push({ text: char, type: 'operator' });
    index += 1;
  }

  return tokens;
}

function skipWhitespace(line: string, index: number) {
  let nextIndex = index;
  while (nextIndex < line.length && /\s/.test(line[nextIndex])) {
    nextIndex += 1;
  }
  return nextIndex;
}

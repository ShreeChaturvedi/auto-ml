import type { ToolCall } from '@/types/llmUi';

export interface EditCellOutput {
  oldContent?: string;
  newContent?: string;
  diff?: {
    linesRemoved?: string[];
    linesAdded?: string[];
  };
}

export function EditCellDiff({ call, output }: { call: ToolCall; output: EditCellOutput }) {
  const args = call.args ?? {};
  const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
  const endLine = typeof args.endLine === 'number' ? args.endLine : startLine;

  const oldContentLines = (output.oldContent ?? '').split('\n');
  const fallbackRemoved =
    startLine != null
      ? oldContentLines.slice(Math.max(0, startLine - 1), Math.max(startLine, endLine ?? startLine))
      : [];
  const fallbackAdded = typeof args.newContent === 'string' ? args.newContent.split('\n') : [];

  const removedLines = (output.diff?.linesRemoved?.length ? output.diff.linesRemoved : fallbackRemoved) ?? [];
  const addedLines = (output.diff?.linesAdded?.length ? output.diff.linesAdded : fallbackAdded) ?? [];

  if (!removedLines.length && !addedLines.length) {
    return <span className="text-muted-foreground italic text-xs">No changes recorded</span>;
  }

  return (
    <div className="font-mono text-[11px] space-y-px">
      {removedLines.map((line, i) => (
        <div key={`old-${i}`} className="text-metric-negative bg-metric-negative/10 px-2 py-0.5 rounded-sm">
          <span className="text-metric-negative/60 select-none mr-2">-</span>
          {line || ' '}
        </div>
      ))}
      {addedLines.map((line, i) => (
        <div key={`new-${i}`} className="text-metric-positive bg-metric-positive/10 px-2 py-0.5 rounded-sm">
          <span className="text-metric-positive/60 select-none mr-2">+</span>
          {line || ' '}
        </div>
      ))}
    </div>
  );
}

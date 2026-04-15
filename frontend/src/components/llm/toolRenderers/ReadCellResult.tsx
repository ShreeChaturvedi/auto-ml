import { CodeBlock } from '@/components/llm/shared/CodeBlock';
import { truncate } from './shared';

export interface ReadCellOutput {
  cellId?: string;
  title?: string;
  content?: string;
  cellType?: string;
  output?: string;
}

export function ReadCellResult({ data }: { data: ReadCellOutput }) {
  const isCode = !data.cellType || data.cellType === 'code';

  return (
    <div className="space-y-2">
      {data.title && (
        <p className="text-xs font-medium text-foreground">{data.title}</p>
      )}
      {data.content && (
        isCode ? (
          <CodeBlock code={truncate(data.content, 2000)} language="python" maxHeight={140} />
        ) : (
          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap max-h-[120px] overflow-y-auto">
            {truncate(data.content, 600)}
          </pre>
        )
      )}
      {data.output && (
        <div className="pl-2">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Output</p>
          <pre className="text-[10px] font-mono text-muted-foreground/80 whitespace-pre-wrap max-h-[80px] overflow-y-auto">
            {truncate(String(data.output), 400)}
          </pre>
        </div>
      )}
    </div>
  );
}

import { truncate } from './shared';

export interface ReadCellOutput {
  cellId?: string;
  title?: string;
  content?: string;
  cellType?: string;
  output?: string;
}

export function ReadCellResult({ data }: { data: ReadCellOutput }) {
  return (
    <div className="space-y-2">
      {data.title && (
        <p className="text-xs font-medium text-foreground">{data.title}</p>
      )}
      {data.content && (
        <pre className="text-[11px] font-mono text-muted-foreground bg-muted/40 rounded-md p-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap">
          {truncate(data.content, 600)}
        </pre>
      )}
      {data.output && (
        <div className="text-[10px] font-mono text-muted-foreground/80 bg-muted/20 rounded-md p-2 max-h-[80px] overflow-y-auto">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Output</p>
          <pre className="whitespace-pre-wrap">{truncate(String(data.output), 400)}</pre>
        </div>
      )}
    </div>
  );
}

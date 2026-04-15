import { truncate } from './shared';

export interface DatasetSampleOutput {
  datasetId?: string;
  filename?: string;
  sample?: Record<string, unknown>[];
}

export function DatasetSampleResult({ data }: { data: DatasetSampleOutput }) {
  const sample = data.sample ?? [];
  if (sample.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No sample rows available.</p>;
  }

  const columnNames = Object.keys(sample[0]);
  const displayCols = columnNames.slice(0, 8);
  const hasMoreCols = columnNames.length > 8;

  return (
    <div className="space-y-2">
      {/* Filename + file-type icon live in the parent `ToolIndicator` label. */}
      <p className="text-[11px] text-muted-foreground">
        {sample.length} row{sample.length !== 1 ? 's' : ''}
        {hasMoreCols && ` · showing ${displayCols.length} of ${columnNames.length} columns`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border/40 text-muted-foreground">
              {displayCols.map((col) => (
                <th key={col} className="text-left py-1 pr-2 font-medium font-mono whitespace-nowrap">
                  {truncate(col, 16)}
                </th>
              ))}
              {hasMoreCols && <th className="text-left py-1 font-medium text-muted-foreground/50">…</th>}
            </tr>
          </thead>
          <tbody>
            {sample.slice(0, 5).map((row, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0">
                {displayCols.map((col) => (
                  <td key={col} className="py-1 pr-2 text-muted-foreground whitespace-nowrap max-w-[120px] truncate">
                    {row[col] == null ? <span className="text-muted-foreground/40 italic">null</span> : String(row[col])}
                  </td>
                ))}
                {hasMoreCols && <td className="py-1 text-muted-foreground/50">…</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { formatNumber, truncate, dtypeInfo } from './shared';
import { DimensionPill } from './sharedComponents';

export interface ProfileColumn {
  name: string;
  dtype: string;
  nullCount: number;
  uniqueCount?: number;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
}

export interface DatasetProfileOutput {
  datasetId?: string;
  filename?: string;
  fileType?: string;
  nRows?: number;
  nCols?: number;
  columns?: ProfileColumn[];
  size?: number;
}

export function DatasetProfileResult({ data }: { data: DatasetProfileOutput }) {
  const columns = data.columns ?? [];
  // Filename + file-type icon now live in the parent `ToolIndicator` label
  // ("Read dataset profile for <icon> <name>"), so this renderer only shows
  // the row × col dimension pill and the per-column stats table.
  return (
    <div className="space-y-3">
      {(data.nRows != null || data.nCols != null) && (
        <div className="flex flex-wrap items-center gap-2">
          <DimensionPill rows={data.nRows} cols={data.nCols} />
        </div>
      )}

      {/* Column stats table */}
      {columns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground">
                <th className="text-left py-1 pr-3 font-medium">Column</th>
                <th className="text-left py-1 pr-3 font-medium">Type</th>
                <th className="text-right py-1 pr-3 font-medium">Nulls</th>
                <th className="text-right py-1 pr-3 font-medium">Unique</th>
                <th className="text-right py-1 pr-3 font-medium">Min</th>
                <th className="text-right py-1 pr-3 font-medium">Max</th>
                <th className="text-right py-1 font-medium">Mean</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => {
                const info = dtypeInfo(col.dtype);
                return (
                  <tr key={col.name} className="border-b border-border/20 last:border-0">
                    <td className="py-1 pr-3 font-mono text-foreground whitespace-nowrap">
                      {truncate(col.name, 24)}
                    </td>
                    <td className="py-1 pr-3">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {info.icon}
                        {info.label}
                      </span>
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                      {col.nullCount.toLocaleString()}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                      {col.uniqueCount != null ? col.uniqueCount.toLocaleString() : '–'}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                      {col.min != null ? formatNumber(col.min) : '–'}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                      {col.max != null ? formatNumber(col.max) : '–'}
                    </td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">
                      {col.mean != null ? formatNumber(col.mean) : '–'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

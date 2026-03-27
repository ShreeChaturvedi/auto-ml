import { Bookmark, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { asRecord, asString, asStringArray } from '@/lib/typeCoercion';

export interface CheckpointFeaturePipelineOutput {
  status: string;
  message: string;
  checkpointId: string;
  label: string;
  featureIds: string[];
  datasetId: string;
}

export function CheckpointFeaturePipelineResult({ output }: { output: unknown }) {
  const out = asRecord(output);
  const status = asString(out.status);
  const message = asString(out.message);
  const checkpointId = asString(out.checkpointId);
  const label = asString(out.label);
  const featureIds = asStringArray(out.featureIds);
  const datasetId = asString(out.datasetId);

  const fields: [string, string | undefined, boolean?][] = [
    ['Label', label],
    ['ID', checkpointId ? checkpointId.slice(0, 12) : undefined, true],
    ['Dataset', datasetId ? datasetId.slice(0, 12) : undefined, true],
  ];

  return (
    <div className="space-y-1.5 text-xs">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground">Feature checkpoint</span>
        <Badge
          variant="outline"
          className={
            featureIds.length > 0
              ? 'text-[10px] text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700'
              : 'text-[10px] text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700'
          }
        >
          {featureIds.length} feature{featureIds.length !== 1 ? 's' : ''}
        </Badge>
        {status && (
          <Badge variant="outline" className="text-[10px] capitalize ml-auto">
            {status.replaceAll('_', ' ')}
          </Badge>
        )}
      </div>

      {/* Key-value details */}
      {fields.some(([, v]) => v) && (
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
          {fields.map(([fieldLabel, value, mono]) =>
            value ? (
              <div key={fieldLabel} className="contents">
                <span>{fieldLabel}</span>
                <span className={mono ? 'font-mono' : 'text-foreground'}>{value}</span>
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* Empty features warning */}
      {featureIds.length === 0 && (
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>No features included in this checkpoint.</span>
        </div>
      )}

      {/* Message */}
      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  );
}

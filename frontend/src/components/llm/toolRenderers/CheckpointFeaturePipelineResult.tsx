import { Bookmark } from 'lucide-react';
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

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5 text-foreground font-medium">
        <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
        Feature pipeline checkpoint
        {status && (
          <span className="text-muted-foreground font-normal capitalize">· {status.replaceAll('_', ' ')}</span>
        )}
      </div>
      {label && <p className="text-muted-foreground">Label: {label}</p>}
      {checkpointId && (
        <p className="text-muted-foreground">
          ID: <span className="font-mono">{checkpointId.slice(0, 12)}</span>
        </p>
      )}
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Features:</span>
        <Badge
          variant="outline"
          className={featureIds.length > 0
            ? 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
            : 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800'
          }
        >
          {featureIds.length}
        </Badge>
      </div>
      {featureIds.length === 0 && (
        <p className="text-amber-600 dark:text-amber-400">⚠ No features included in this checkpoint.</p>
      )}
      {datasetId && (
        <p className="text-muted-foreground">
          Dataset: <span className="font-mono">{datasetId.slice(0, 12)}</span>
        </p>
      )}
      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  );
}

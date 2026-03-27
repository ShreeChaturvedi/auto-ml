import { Bookmark, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { asRecord, asString, asStringArray } from '@/lib/typeCoercion';
import { DetailGrid, StatusBadge, type DetailField } from './sharedComponents';

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

  const fields: DetailField[] = [
    { label: 'Label', value: label },
    { label: 'ID', value: checkpointId ? checkpointId.slice(0, 12) : undefined, mono: true },
    { label: 'Dataset', value: datasetId ? datasetId.slice(0, 12) : undefined, mono: true },
  ];

  return (
    <div className="space-y-1.5 text-xs">
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
        {status && <StatusBadge status={status} className="ml-auto" />}
      </div>

      <DetailGrid fields={fields} />

      {featureIds.length === 0 && (
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>No features included in this checkpoint.</span>
        </div>
      )}

      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  );
}

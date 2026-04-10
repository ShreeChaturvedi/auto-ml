import { Bookmark, AlertTriangle } from 'lucide-react';
import { asRecord, asString, asStringArray } from '@/lib/typeCoercion';
import { StatusPill } from '@/components/llm/shared/StatusPill';
import { normalizeStatus } from './shared';
import { DetailGrid, type DetailField } from './sharedComponents';

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
        <StatusPill
          status={featureIds.length > 0 ? 'success' : 'pending'}
          label={`${featureIds.length} feature${featureIds.length !== 1 ? 's' : ''}`}
        />
        {status && <StatusPill status={normalizeStatus(status)} label={status} className="ml-auto" />}
      </div>

      <DetailGrid fields={fields} />

      {featureIds.length === 0 && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>No features included in this checkpoint.</span>
        </div>
      )}

      {message && <p className="text-muted-foreground">{message}</p>}
    </div>
  );
}

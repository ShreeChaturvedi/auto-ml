import { Settings2 } from 'lucide-react';
import { asRecord, asString } from '@/lib/typeCoercion';
import { DetailGrid, StatusBadge, type DetailField } from './sharedComponents';

export interface ConfigureExperimentOutput {
  experimentId: string;
  experimentName: string;
  modelType: string;
  splitStrategy: string;
  status: string;
}

export function ConfigureExperimentResult({ output }: { output: unknown }) {
  const out = asRecord(output);
  const name = asString(out.experimentName) ?? 'Untitled experiment';
  const modelType = asString(out.modelType);
  const splitStrategy = asString(out.splitStrategy);
  const experimentId = asString(out.experimentId);
  const status = asString(out.status);

  const fields: DetailField[] = [
    { label: 'Model', value: modelType },
    { label: 'Split', value: splitStrategy },
    { label: 'ID', value: experimentId ? experimentId.slice(0, 12) : undefined, mono: true },
  ];

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground">{name}</span>
        {status && <StatusBadge status={status} className="ml-auto" />}
      </div>
      <DetailGrid fields={fields} />
    </div>
  );
}

import { Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { asRecord, asString } from '@/lib/typeCoercion';

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

  const fields: [string, string | undefined, boolean?][] = [
    ['Model', modelType],
    ['Split', splitStrategy],
    ['ID', experimentId ? experimentId.slice(0, 12) : undefined, true],
  ];

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground">{name}</span>
        {status && (
          <Badge variant="outline" className="text-[10px] capitalize ml-auto">
            {status.replaceAll('_', ' ')}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
        {fields.map(([label, value, mono]) =>
          value ? (
            <div key={label} className="contents">
              <span>{label}</span>
              <span className={mono ? 'font-mono' : 'text-foreground'}>{value}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelRecord } from '@/types/model';

interface ReadinessProps {
  model: ModelRecord;
}

export function DeploymentReadiness({ model }: ReadinessProps) {
  const checks = [
    { label: 'Model trained successfully', ok: model.status === 'completed' },
    { label: 'Evaluation complete', ok: model.evaluationStatus === 'ready' },
    { label: 'Deployable task type', ok: model.taskType !== 'clustering' },
    { label: 'Feature columns defined', ok: (model.featureColumns?.length ?? 0) > 0 },
    { label: 'Feature types available', ok: !!model.featureTypes },
  ];

  return (
    <div className="space-y-1.5">
      {checks.map(check => (
        <div key={check.label} className="flex items-center gap-2 text-xs">
          {check.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className={cn(check.ok ? 'text-foreground' : 'text-muted-foreground')}>
            {check.label}
          </span>
        </div>
      ))}
    </div>
  );
}

import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { cn } from '@/lib/utils';
import type { DeploymentStatus } from '@/types/deployment';

function statusLabel(status: DeploymentStatus): string {
  const labels: Record<DeploymentStatus, string> = {
    creating: 'Creating', starting: 'Starting', healthy: 'Healthy',
    unhealthy: 'Unhealthy', stopping: 'Stopping', stopped: 'Stopped', failed: 'Failed',
  };
  return labels[status] ?? status;
}

function statusColor(status: DeploymentStatus): string {
  if (status === 'healthy') return 'bg-green-500';
  if (['starting', 'creating', 'unhealthy'].includes(status)) return 'bg-amber-500';
  return 'bg-red-500';
}

const PULSE_STATUSES: DeploymentStatus[] = ['healthy', 'starting', 'creating'];

export function DeploymentList() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { colorClasses } = useProjectThemeColor();
  const deployments = useDeploymentStore((s) => s.deployments);
  const selectedId = useDeploymentStore((s) => s.selectedDeploymentId);
  const selectDeployment = useDeploymentStore((s) => s.selectDeployment);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 min-w-0">
      {deployments.map((d) => {
        const isSelected = d.deploymentId === selectedId;
        const dotColor = statusColor(d.status);
        const pulse = PULSE_STATUSES.includes(d.status);

        return (
          <button
            key={d.deploymentId}
            onClick={() => selectDeployment(d.deploymentId)}
            className={cn(
              'flex-shrink-0 flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left',
              'bg-card transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isSelected
                ? cn('border-2', colorClasses?.border ?? 'border-primary')
                : 'border-border',
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden="true">
                <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75', dotColor, pulse && 'animate-ping')} />
                <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor)} />
              </span>
              <span className="text-xs text-muted-foreground leading-none">{statusLabel(d.status)}</span>
            </div>
            <span className="text-sm font-medium leading-tight truncate max-w-[160px]">{d.name}</span>
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">{d.modelId}</span>
          </button>
        );
      })}

      <Button
        variant="outline"
        size="sm"
        className="flex-shrink-0 gap-1.5"
        onClick={() => navigate(`/project/${projectId}/experiments`)}
      >
        <Plus className="h-3.5 w-3.5" />
        Deploy
      </Button>
    </div>
  );
}

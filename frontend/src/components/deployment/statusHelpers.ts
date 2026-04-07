import type { DeploymentStatus } from '@/types/deployment';

export function statusLabel(status: DeploymentStatus): string {
  const labels: Record<DeploymentStatus, string> = {
    creating: 'Creating',
    starting: 'Starting',
    healthy: 'Healthy',
    unhealthy: 'Unhealthy',
    stopping: 'Stopping',
    stopped: 'Stopped',
    failed: 'Failed',
  };
  return labels[status];
}

export function statusDotColor(status: DeploymentStatus): string {
  if (status === 'healthy') return 'bg-green-500';
  if (status === 'unhealthy' || status === 'starting' || status === 'creating') return 'bg-amber-500';
  if (status === 'stopped') return 'bg-muted-foreground';
  return 'bg-red-500';
}

export function statusBadgeVariant(status: DeploymentStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'healthy') return 'default';
  if (status === 'starting' || status === 'creating') return 'secondary';
  if (status === 'failed' || status === 'stopped') return 'destructive';
  return 'outline';
}

export const PULSE_STATUSES = new Set<DeploymentStatus>(['healthy', 'starting', 'creating']);

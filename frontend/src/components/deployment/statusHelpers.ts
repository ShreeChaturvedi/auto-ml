import type { DeploymentStatus } from '@/types/deployment';

/** Human-readable status label. */
export function statusLabel(status: DeploymentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Dot color class for a deployment status indicator. */
export function statusDotColor(status: DeploymentStatus): string {
  if (status === 'healthy') return 'bg-green-500 dark:bg-green-400';
  if (['starting', 'creating', 'stopping'].includes(status)) return 'bg-amber-500 dark:bg-amber-400';
  if (status === 'stopped') return 'bg-muted-foreground';
  // unhealthy + failed → red
  return 'bg-red-500 dark:bg-red-400';
}

/** Badge variant for a deployment status. */
export function statusBadgeVariant(
  status: DeploymentStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'healthy') return 'default';
  if (['starting', 'creating', 'stopping'].includes(status)) return 'secondary';
  if (status === 'stopped') return 'secondary';
  if (status === 'unhealthy' || status === 'failed') return 'destructive';
  return 'outline';
}

/** Statuses that should display a pulsing animation (transitional only). */
export const PULSE_STATUSES: Set<DeploymentStatus> = new Set([
  'starting',
  'creating',
]);

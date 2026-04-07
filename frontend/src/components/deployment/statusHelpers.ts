import type { DeploymentStatus } from '@/types/deployment';

/** Human-readable status label. */
export function statusLabel(status: DeploymentStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Dot color class for a deployment status indicator. */
export function statusDotColor(status: DeploymentStatus): string {
  if (status === 'healthy') return 'bg-green-500';
  if (['starting', 'creating', 'unhealthy'].includes(status)) return 'bg-amber-500';
  if (status === 'stopped') return 'bg-muted-foreground';
  return 'bg-red-500';
}

/** Badge variant for a deployment status. */
export function statusBadgeVariant(
  status: DeploymentStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'healthy') return 'default';
  if (['starting', 'creating'].includes(status)) return 'secondary';
  if (['failed', 'stopped'].includes(status)) return 'destructive';
  return 'outline';
}

/** Statuses that should display a pulsing animation. */
export const PULSE_STATUSES: Set<DeploymentStatus> = new Set([
  'healthy',
  'starting',
  'creating',
]);

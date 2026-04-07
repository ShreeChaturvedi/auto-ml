/**
 * DeploymentSubtabs — renders deployed models under the Deployment phase.
 * Reuses SubtabItem for uniform sidebar spacing.
 */

import { type ComponentType, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Square, Play } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useDeploymentStore } from '@/stores/deploymentStore';
import type { DeploymentStatus } from '@/types/deployment';
import { cn } from '@/lib/utils';
import { SubtabItem } from './SubtabItem';
import { SidebarSubtabActionMenu } from './SidebarSubtabActionMenu';
import { useSidebarDeleteConfirm } from './useSidebarDeleteConfirm';

function statusDotColor(status: DeploymentStatus): string {
  if (status === 'healthy') return 'bg-green-500';
  if (['starting', 'creating'].includes(status)) return 'bg-amber-500';
  if (status === 'unhealthy') return 'bg-amber-500';
  if (status === 'stopped') return 'bg-muted-foreground';
  return 'bg-red-500';
}

const PULSE_STATUSES = new Set<DeploymentStatus>(['healthy', 'starting', 'creating']);

/** Inline status-dot icon component for SubtabItem */
function makeStatusIcon(status: DeploymentStatus): ComponentType<{ className?: string }> {
  const dotColor = statusDotColor(status);
  const pulse = PULSE_STATUSES.has(status);

  return function StatusDot({ className }: { className?: string }) {
    return (
      <span className={cn('relative inline-flex h-2 w-2', className)} aria-hidden="true">
        {pulse && (
          <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', dotColor)} />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor)} />
      </span>
    );
  };
}

interface DeploymentSubtabsProps {
  projectId: string;
  isActivePhase: boolean;
}

export function DeploymentSubtabs({ projectId, isActivePhase }: DeploymentSubtabsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { requestDelete, confirmDialog } = useSidebarDeleteConfirm();

  const deployments = useDeploymentStore((s) => s.deployments);
  const refreshDeployments = useDeploymentStore((s) => s.refreshDeployments);
  const selectedDeploymentId = useDeploymentStore((s) => s.selectedDeploymentId);
  const selectDeployment = useDeploymentStore((s) => s.selectDeployment);
  const remove = useDeploymentStore((s) => s.remove);
  const stop = useDeploymentStore((s) => s.stop);
  const start = useDeploymentStore((s) => s.start);

  const isOnDeployment = location.pathname.endsWith('/deployment');

  // Hydrate deployments when the phase becomes active
  useEffect(() => {
    if (projectId && isActivePhase) void refreshDeployments(projectId);
  }, [projectId, isActivePhase, refreshDeployments]);

  const projectDeployments = useMemo(
    () => deployments.filter((d) => d.projectId === projectId),
    [deployments, projectId]
  );

  if (projectDeployments.length === 0) return null;

  return (
    <>
      <div className="space-y-0.5">
        {projectDeployments.map((dep) => {
          const canStop = dep.status === 'healthy' || dep.status === 'starting' || dep.status === 'creating';
          const canStart = dep.status === 'stopped';

          return (
            <SubtabItem
              key={dep.deploymentId}
              icon={makeStatusIcon(dep.status)}
              label={dep.name}
              isActive={isOnDeployment && dep.deploymentId === selectedDeploymentId}
              onClick={() => {
                navigate(`/project/${projectId}/deployment`);
                selectDeployment(dep.deploymentId);
              }}
              actionSlot={
                <SidebarSubtabActionMenu ariaLabel="Deployment options">
                  {canStop && (
                    <DropdownMenuItem onClick={() => stop(dep.deploymentId)}>
                      <Square className="h-4 w-4 mr-2" />
                      Stop
                    </DropdownMenuItem>
                  )}
                  {canStart && (
                    <DropdownMenuItem onClick={() => start(dep.deploymentId)}>
                      <Play className="h-4 w-4 mr-2" />
                      Start
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      requestDelete({
                        title: 'Delete deployment?',
                        description: `Permanently remove "${dep.name}" and its endpoint. This cannot be undone.`,
                        onConfirm: () => remove(dep.deploymentId),
                      })
                    }
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </SidebarSubtabActionMenu>
              }
            />
          );
        })}
      </div>
      {confirmDialog}
    </>
  );
}

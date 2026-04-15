/**
 * DeploymentSubtabs — renders deployed models under the Deployment phase.
 * Uses theme-colored Rocket icon with a small status dot via SubtabItem's indicatorDotClass.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Rocket, Trash2, Square, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { statusDotColor, PULSE_STATUSES } from '@/components/deployment/statusHelpers';
import { SubtabItem } from './SubtabItem';
import { SidebarSubtabActionMenu } from './SidebarSubtabActionMenu';
import { useSidebarDeleteConfirm } from './useSidebarDeleteConfirm';

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
              icon={Rocket}
              indicatorDotClass={cn(
                statusDotColor(dep.status),
                PULSE_STATUSES.has(dep.status) && 'animate-pulse'
              )}
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

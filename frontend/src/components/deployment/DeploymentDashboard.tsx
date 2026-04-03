import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { useModelStore } from '@/stores/modelStore';
import { getDeploymentWSClient } from '@/lib/websocket/deploymentClient';
import { DeploymentDetail } from './DeploymentDetail';
import { DeploymentList } from './DeploymentList';
import { DeploymentEmptyState } from './DeploymentEmptyState';

export function DeploymentDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const { deployments, selectedDeploymentId, isLoading, refreshDeployments, updateDeploymentStatus } =
    useDeploymentStore();
  const refreshModels = useModelStore(s => s.refreshModels);

  // Refresh on mount
  useEffect(() => {
    if (projectId) {
      refreshDeployments(projectId);
      refreshModels(projectId);
    }
  }, [projectId, refreshDeployments, refreshModels]);

  // WebSocket connection
  useEffect(() => {
    const wsClient = getDeploymentWSClient();
    wsClient.connect().catch(() => {});

    const unsubscribe = wsClient.onEvent((event) => {
      if (event.type === 'status_change') {
        updateDeploymentStatus(event.deploymentId, event.status, event.errorMessage);
      }
      if (event.type === 'health_update' && event.healthy) {
        updateDeploymentStatus(event.deploymentId, 'healthy');
      }
    });

    if (selectedDeploymentId) {
      wsClient.subscribe(selectedDeploymentId);
    }

    return () => {
      unsubscribe();
      wsClient.disconnect();
    };
  }, [selectedDeploymentId, updateDeploymentStatus]);

  // Reconnect on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && projectId) {
        refreshDeployments(projectId);
        getDeploymentWSClient().connect().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [projectId, refreshDeployments]);

  if (isLoading && deployments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading deployments...</p>
      </div>
    );
  }

  if (deployments.length === 0) {
    return <DeploymentEmptyState />;
  }

  const selected = deployments.find((d) => d.deploymentId === selectedDeploymentId);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DeploymentList />
      {selected && <DeploymentDetail deployment={selected} />}
    </div>
  );
}

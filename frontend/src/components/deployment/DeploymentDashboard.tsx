import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDeploymentStore } from '@/stores/deploymentStore';

export function DeploymentDashboard() {
  const { projectId } = useParams<{ projectId: string }>();
  const { deployments, isLoading, refreshDeployments } = useDeploymentStore();

  useEffect(() => {
    if (projectId) {
      refreshDeployments(projectId);
    }
  }, [projectId, refreshDeployments]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading deployments...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Deployment</h2>
        <span className="text-xs text-muted-foreground">
          {deployments.length} deployment{deployments.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Deployment dashboard — components will be added in Phase D
      </div>
    </div>
  );
}

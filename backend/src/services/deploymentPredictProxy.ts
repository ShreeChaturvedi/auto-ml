import type { DeploymentCacheEntry, DeploymentRecord } from '../types/deployment.js';

export function rewriteDeploymentPredictPath(path: string) {
  const queryIndex = path.indexOf('?');
  const query = queryIndex >= 0 ? path.slice(queryIndex) : '';
  return `/predict${query}`;
}

export function resolveDeploymentPredictTarget(
  deployment: DeploymentRecord,
  cacheEntry?: DeploymentCacheEntry,
) {
  if (cacheEntry?.status === 'healthy') {
    return `http://127.0.0.1:${cacheEntry.port}`;
  }

  if (deployment.status === 'healthy' && deployment.port) {
    return `http://127.0.0.1:${deployment.port}`;
  }

  throw new Error('Deployment not available');
}

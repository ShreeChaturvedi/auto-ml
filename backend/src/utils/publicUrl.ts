import type { Request } from 'express';

import type { DeploymentRecord } from '../types/deployment.js';

type RequestLike = Pick<Request, 'protocol' | 'get'>;

function readForwardedHeader(req: RequestLike, header: string): string | null {
  const value = req.get(header);
  if (!value) return null;

  const first = value
    .split(',')
    .map((part) => part.trim())
    .find(Boolean);

  return first ?? null;
}

export function resolveRequestOrigin(req: RequestLike): string | null {
  const host = readForwardedHeader(req, 'x-forwarded-host') ?? req.get('host');
  if (!host) return null;

  const protocol = readForwardedHeader(req, 'x-forwarded-proto') ?? req.protocol;
  return `${protocol}://${host}`;
}

export function buildPublicDeploymentUrl(req: RequestLike, deploymentId: string): string | undefined {
  const origin = resolveRequestOrigin(req);
  if (!origin) return undefined;
  return `${origin}/api/deployments/${deploymentId}`;
}

export function toClientDeployment(req: RequestLike, deployment: DeploymentRecord): DeploymentRecord {
  return {
    ...deployment,
    endpointUrl: buildPublicDeploymentUrl(req, deployment.deploymentId) ?? deployment.endpointUrl
  };
}

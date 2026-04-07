import type { IncomingMessage } from 'node:http';

import type { Response, NextFunction } from 'express';

import { createDeploymentRepository, verifyApiKey } from '../repositories/deploymentRepository.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import { authService } from '../services/authService.js';
import type { DeploymentRecord } from '../types/deployment.js';

import { verifyProjectOwnership } from './resourceOwnership.js';

const deploymentRepo = createDeploymentRepository();
const projectRepo = getProjectRepository();

/** Extends IncomingMessage for proxy compatibility */
export interface PredictRequest extends IncomingMessage {
  params: Record<string, string>;
  deployment?: DeploymentRecord;
  parsedBody?: Record<string, unknown>;
}

/**
 * Dual-auth middleware for the predict proxy endpoint.
 *
 * Path A: `x-api-key` header -- verifies the key belongs to the deployment.
 * Path B: `Authorization: Bearer <jwt>` -- verifies JWT and project ownership.
 */
export async function requireDeploymentAuth(
  req: PredictRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const deploymentId = req.params.deploymentId;
  if (!deploymentId) {
    res.status(400).json({ error: 'Missing deployment ID' });
    return;
  }

  const deployment = await deploymentRepo.getById(deploymentId);
  if (!deployment) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // Path A: API key
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    const keyRecord = await verifyApiKey(apiKey, deploymentRepo);
    if (!keyRecord || keyRecord.deploymentId !== deployment.deploymentId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    req.deployment = deployment;
    return next();
  }

  // Path B: JWT
  const authHeader = req.headers.authorization as string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    const payload = authService.verifyAccessToken(authHeader.substring(7));
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    const project = await verifyProjectOwnership(deployment.projectId, payload.userId, projectRepo);
    if (!project) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    req.deployment = deployment;
    return next();
  }

  res.status(401).json({ error: 'Authentication required' });
}

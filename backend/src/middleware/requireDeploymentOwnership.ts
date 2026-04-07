import type { Response, NextFunction } from 'express';

import { createDeploymentRepository } from '../repositories/deploymentRepository.js';
import { getProjectRepository } from '../repositories/projectRepository.js';
import type { AuthRequest } from '../types/auth.js';
import type { DeploymentRecord } from '../types/deployment.js';

import { verifyProjectOwnership } from './resourceOwnership.js';

export interface DeploymentAuthRequest extends AuthRequest {
  deployment?: DeploymentRecord;
}

const deploymentRepo = createDeploymentRepository();
const projectRepo = getProjectRepository();

export async function requireDeploymentOwnership(
  req: DeploymentAuthRequest, res: Response, next: NextFunction
): Promise<void> {
  const deploymentId = req.params.id;
  if (!deploymentId) { res.status(400).json({ error: 'Missing deployment ID' }); return; }

  const deployment = await deploymentRepo.getById(deploymentId);
  if (!deployment) { res.status(404).json({ error: 'Deployment not found' }); return; }

  // Verify user owns the deployment's project
  const project = await verifyProjectOwnership(deployment.projectId, req.user?.user_id ?? '', projectRepo);
  if (!project) { res.status(404).json({ error: 'Deployment not found' }); return; }

  req.deployment = deployment;
  next();
}

/**
 * Deployment Manager
 *
 * Manages the lifecycle of model deployment containers: create, start, stop,
 * delete. Maintains an in-memory cache for fast port lookups by the predict
 * proxy, with crash-safe DB persistence and periodic health checking.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';
import { createModelRepository } from '../repositories/modelRepository.js';
import type {
  DeploymentCacheEntry,
  DeploymentRecord,
  DeploymentStatus,
  DeploymentWSEvent,
} from '../types/deployment.js';

import { ensureRuntimeImage } from './container/imageManager.js';
import { buildInferenceDockerRunArgs } from './container/inferenceDockerBuilder.js';
import { execDocker } from './dockerUtils.js';
import { buildInferenceServerScript } from './inferenceServerBuilder.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

export const MAX_DEPLOYMENTS_PER_PROJECT = 5;

const HEALTH_CHECK_INTERVAL_MS = 15_000;
const HEALTH_CHECK_TIMEOUT_MS = 3_000;
const READINESS_POLL_INTERVAL_MS = 1_000;
const READINESS_TIMEOUT_MS = 60_000;
const CONSECUTIVE_FAILURES_THRESHOLD = 3;
const STALE_CREATING_THRESHOLD_MS = 120_000;

const LOG_TAG = '[deploymentManager]';

/* ------------------------------------------------------------------ */
/*  Model repository                                                  */
/* ------------------------------------------------------------------ */

const modelRepository = createModelRepository(env.modelMetadataPath);

/* ------------------------------------------------------------------ */
/*  Deployment repository (lazy — created concurrently)               */
/* ------------------------------------------------------------------ */

type DeploymentRepository = Awaited<ReturnType<typeof import('../repositories/deploymentRepository.js').createDeploymentRepository>>;

let _deploymentRepo: DeploymentRepository | null = null;
async function getDeploymentRepo(): Promise<DeploymentRepository> {
  if (!_deploymentRepo) {
    const mod = await import('../repositories/deploymentRepository.js');
    _deploymentRepo = mod.createDeploymentRepository();
  }
  return _deploymentRepo;
}

/* ------------------------------------------------------------------ */
/*  WS broadcast (setter pattern to avoid circular dep)               */
/* ------------------------------------------------------------------ */

let broadcastFn: ((deploymentId: string, event: DeploymentWSEvent) => void) | null = null;

export function setDeploymentWSBroadcast(fn: typeof broadcastFn) {
  broadcastFn = fn;
}

function broadcast(deploymentId: string, event: DeploymentWSEvent) {
  try {
    broadcastFn?.(deploymentId, event);
  } catch (err) {
    appLogger.warn(`${LOG_TAG} WS broadcast failed`, err);
  }
}

/* ------------------------------------------------------------------ */
/*  In-memory cache                                                   */
/* ------------------------------------------------------------------ */

const deploymentCache = new Map<string, DeploymentCacheEntry>();

export function getDeploymentFromCache(deploymentId: string): DeploymentCacheEntry | undefined {
  return deploymentCache.get(deploymentId);
}

/* ------------------------------------------------------------------ */
/*  Promise deduplication                                             */
/* ------------------------------------------------------------------ */

const pendingDeploys = new Map<string, Promise<DeploymentRecord>>();

function deduplicationKey(modelId: string, projectId: string): string {
  return `${modelId}::${projectId}`;
}

/* ------------------------------------------------------------------ */
/*  Health check loop                                                 */
/* ------------------------------------------------------------------ */

let healthCheckTimer: NodeJS.Timeout | null = null;

export function startHealthCheckLoop(): void {
  if (healthCheckTimer) return;

  healthCheckTimer = setInterval(async () => {
    for (const [id, entry] of deploymentCache) {
      if (entry.status === 'stopped' || entry.status === 'failed') continue;

      try {
        const res = await fetch(`http://127.0.0.1:${entry.port}/health/ready`, {
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
        });

        if (res.ok) {
          entry.consecutiveFailures = 0;
          entry.lastHealthCheck = new Date();
          if (entry.status !== 'healthy') {
            const previousStatus = entry.status;
            entry.status = 'healthy';
            await updateDeploymentStatus(id, 'healthy');
            broadcast(id, { type: 'status_change', deploymentId: id, status: 'healthy' });
            appLogger.info(`${LOG_TAG} ${id} promoted ${previousStatus} -> healthy`);
          }
        } else {
          throw new Error('Not ready');
        }
      } catch {
        entry.consecutiveFailures++;
        entry.lastHealthCheck = new Date();
        if (entry.consecutiveFailures >= CONSECUTIVE_FAILURES_THRESHOLD && entry.status === 'healthy') {
          entry.status = 'unhealthy';
          await updateDeploymentStatus(id, 'unhealthy');
          broadcast(id, { type: 'status_change', deploymentId: id, status: 'unhealthy' });
          appLogger.warn(`${LOG_TAG} ${id} marked unhealthy after ${entry.consecutiveFailures} failures`);
        }
      }
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

export function stopHealthCheckLoop(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

/* ------------------------------------------------------------------ */
/*  DB helpers                                                        */
/* ------------------------------------------------------------------ */

async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  extra?: Partial<Pick<DeploymentRecord, 'containerId' | 'port' | 'endpointUrl' | 'errorMessage' | 'stoppedAt'>>,
): Promise<void> {
  try {
    const repo = await getDeploymentRepo();
    await repo.update(deploymentId, (current: DeploymentRecord) => ({
      ...current,
      status,
      ...extra,
    }));
  } catch (err) {
    appLogger.error(`${LOG_TAG} Failed to update deployment status in DB`, { deploymentId, status, err });
  }
}

/* ------------------------------------------------------------------ */
/*  Core lifecycle: deployModel                                       */
/* ------------------------------------------------------------------ */

export async function deployModel(
  modelId: string,
  projectId: string,
  name: string,
): Promise<DeploymentRecord> {
  const key = deduplicationKey(modelId, projectId);

  const existing = pendingDeploys.get(key);
  if (existing) return existing;

  const promise = deployModelInternal(modelId, projectId, name).finally(() => {
    pendingDeploys.delete(key);
  });

  pendingDeploys.set(key, promise);
  return promise;
}

async function deployModelInternal(
  modelId: string,
  projectId: string,
  name: string,
): Promise<DeploymentRecord> {
  // 1. Check deployment limit
  const repo = await getDeploymentRepo();
  const projectDeployments: DeploymentRecord[] = await repo.list(projectId);
  const activeCount = projectDeployments.filter(
    (d: DeploymentRecord) => d.status !== 'stopped' && d.status !== 'failed',
  ).length;

  if (activeCount >= MAX_DEPLOYMENTS_PER_PROJECT) {
    throw new Error(`Deployment limit reached: max ${MAX_DEPLOYMENTS_PER_PROJECT} active deployments per project`);
  }

  // 2. Validate model eligibility
  const model = await modelRepository.getById(modelId);
  if (!model) throw new Error(`Model not found: ${modelId}`);
  if (model.taskType !== 'classification' && model.taskType !== 'regression') {
    throw new Error(`Model task type "${model.taskType}" is not eligible for deployment (requires classification or regression)`);
  }
  if (!model.artifact?.path) {
    throw new Error('Model has no artifact — train the model before deploying');
  }

  // 3. Generate serve.py
  const servePy = buildInferenceServerScript(model);

  // 4. Write serve.py to deployment storage
  const deploymentId = randomUUID();
  const deploymentDir = join(env.deploymentStorageDir, deploymentId);
  await mkdir(deploymentDir, { recursive: true });
  await writeFile(join(deploymentDir, 'serve.py'), servePy, 'utf8');

  // 5. Write 'creating' row to DB BEFORE docker run (crash safety)
  const now = new Date().toISOString();
  let record: DeploymentRecord = await repo.create({
    deploymentId,
    modelId,
    projectId,
    name,
    status: 'creating' as DeploymentStatus,
    config: {},
    createdAt: now,
    updatedAt: now,
  });

  try {
    // 6. Ensure runtime image
    const imageName = await ensureRuntimeImage('3.11');

    // 7. docker run
    const containerName = `automl-serve-${deploymentId.slice(0, 8)}`;
    const modelArtifactDir = join(env.modelStorageDir, modelId);
    const dockerArgs = buildInferenceDockerRunArgs({
      containerName,
      imageName,
      modelArtifactPath: modelArtifactDir,
      deploymentDir,
    });

    const { stdout: runStdout } = await execDocker(dockerArgs);
    const containerId = runStdout.trim();

    // 8. Read mapped port
    const { stdout: portOutput } = await execDocker(['port', containerId.slice(0, 12), '8000']);
    const portMatch = portOutput.match(/:(\d+)/);
    const port = portMatch ? parseInt(portMatch[1], 10) : 0;
    if (!port) throw new Error('Failed to read mapped port for inference container');

    // 9. Update DB to 'starting'
    const endpointUrl = `http://127.0.0.1:${port}`;
    await updateDeploymentStatus(deploymentId, 'starting', {
      containerId,
      port,
      endpointUrl,
    });
    record = { ...record, status: 'starting', containerId, port, endpointUrl };

    // 10. Add to cache
    deploymentCache.set(deploymentId, {
      deploymentId,
      modelId,
      projectId,
      containerId,
      port,
      status: 'starting',
      consecutiveFailures: 0,
    });

    broadcast(deploymentId, { type: 'status_change', deploymentId, status: 'starting' });

    // 11. Poll /health/ready
    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health/ready`, {
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
        });
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, READINESS_POLL_INTERVAL_MS));
    }

    // 12/13. Promote or leave as 'starting' for health check loop
    if (ready) {
      const cacheEntry = deploymentCache.get(deploymentId);
      if (cacheEntry) cacheEntry.status = 'healthy';
      await updateDeploymentStatus(deploymentId, 'healthy');
      record = { ...record, status: 'healthy' };
      broadcast(deploymentId, { type: 'status_change', deploymentId, status: 'healthy' });
      appLogger.info(`${LOG_TAG} Deployment ${deploymentId} is healthy on port ${port}`);
    } else {
      appLogger.warn(`${LOG_TAG} Deployment ${deploymentId} not ready within ${READINESS_TIMEOUT_MS}ms — health check loop will retry`);
    }

    return record;
  } catch (err) {
    // On failure, update status and clean cache
    const errorMessage = err instanceof Error ? err.message : 'Unknown deployment error';
    deploymentCache.delete(deploymentId);
    await updateDeploymentStatus(deploymentId, 'failed', { errorMessage });
    broadcast(deploymentId, { type: 'status_change', deploymentId, status: 'failed', errorMessage });
    appLogger.error(`${LOG_TAG} Deployment ${deploymentId} failed`, err);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Core lifecycle: stopDeployment                                    */
/* ------------------------------------------------------------------ */

export async function stopDeployment(deploymentId: string): Promise<void> {
  const repo = await getDeploymentRepo();
  const record: DeploymentRecord | undefined = await repo.getById(deploymentId);
  if (!record) throw new Error(`Deployment not found: ${deploymentId}`);

  if (record.status === 'stopped' || record.status === 'failed') {
    throw new Error(`Deployment is already ${record.status}`);
  }

  const cacheEntry = deploymentCache.get(deploymentId);

  // Stop the container
  if (record.containerId) {
    try {
      await execDocker(['stop', '-t', '5', record.containerId]);
    } catch {
      // Container may already be stopped
    }
    try {
      await execDocker(['rm', '-f', record.containerId]);
    } catch {
      // Ignore removal errors
    }
  }

  // Update status
  const stoppedAt = new Date().toISOString();
  await updateDeploymentStatus(deploymentId, 'stopped', { stoppedAt });

  if (cacheEntry) {
    cacheEntry.status = 'stopped';
  }

  broadcast(deploymentId, { type: 'status_change', deploymentId, status: 'stopped' });
  appLogger.info(`${LOG_TAG} Stopped deployment ${deploymentId}`);
}

/* ------------------------------------------------------------------ */
/*  Core lifecycle: startDeployment (restart a stopped deployment)    */
/* ------------------------------------------------------------------ */

export async function startDeployment(deploymentId: string): Promise<void> {
  const repo = await getDeploymentRepo();
  const record: DeploymentRecord | undefined = await repo.getById(deploymentId);
  if (!record) throw new Error(`Deployment not found: ${deploymentId}`);

  if (record.status !== 'stopped' && record.status !== 'failed') {
    throw new Error(`Deployment must be stopped or failed to restart (current: ${record.status})`);
  }

  const model = await modelRepository.getById(record.modelId);
  if (!model) throw new Error(`Model not found: ${record.modelId}`);

  // Regenerate serve.py in case it was lost
  const deploymentDir = join(env.deploymentStorageDir, deploymentId);
  await mkdir(deploymentDir, { recursive: true });
  const servePy = buildInferenceServerScript(model);
  await writeFile(join(deploymentDir, 'serve.py'), servePy, 'utf8');

  await updateDeploymentStatus(deploymentId, 'creating');
  broadcast(deploymentId, { type: 'status_change', deploymentId, status: 'creating' });

  try {
    const imageName = await ensureRuntimeImage('3.11');
    const containerName = `automl-serve-${deploymentId.slice(0, 8)}`;
    const modelArtifactDir = join(env.modelStorageDir, record.modelId);

    const dockerArgs = buildInferenceDockerRunArgs({
      containerName,
      imageName,
      modelArtifactPath: modelArtifactDir,
      deploymentDir,
    });

    const { stdout: runStdout } = await execDocker(dockerArgs);
    const containerId = runStdout.trim();

    const { stdout: portOutput } = await execDocker(['port', containerId.slice(0, 12), '8000']);
    const portMatch = portOutput.match(/:(\d+)/);
    const port = portMatch ? parseInt(portMatch[1], 10) : 0;
    if (!port) throw new Error('Failed to read mapped port for inference container');

    const endpointUrl = `http://127.0.0.1:${port}`;
    await updateDeploymentStatus(deploymentId, 'starting', { containerId, port, endpointUrl, errorMessage: undefined });

    deploymentCache.set(deploymentId, {
      deploymentId,
      modelId: record.modelId,
      projectId: record.projectId,
      containerId,
      port,
      status: 'starting',
      consecutiveFailures: 0,
    });

    broadcast(deploymentId, { type: 'status_change', deploymentId, status: 'starting' });

    // Poll readiness
    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health/ready`, {
          signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
        });
        if (res.ok) {
          const cacheEntry = deploymentCache.get(deploymentId);
          if (cacheEntry) cacheEntry.status = 'healthy';
          await updateDeploymentStatus(deploymentId, 'healthy');
          broadcast(deploymentId, { type: 'status_change', deploymentId, status: 'healthy' });
          appLogger.info(`${LOG_TAG} Restarted deployment ${deploymentId} on port ${port}`);
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, READINESS_POLL_INTERVAL_MS));
    }

    appLogger.warn(`${LOG_TAG} Restarted deployment ${deploymentId} not ready within timeout — health check loop will retry`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    deploymentCache.delete(deploymentId);
    await updateDeploymentStatus(deploymentId, 'failed', { errorMessage });
    broadcast(deploymentId, { type: 'status_change', deploymentId, status: 'failed', errorMessage });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Core lifecycle: deleteDeployment                                  */
/* ------------------------------------------------------------------ */

export async function deleteDeployment(deploymentId: string): Promise<void> {
  const repo = await getDeploymentRepo();
  const record: DeploymentRecord | undefined = await repo.getById(deploymentId);
  if (!record) throw new Error(`Deployment not found: ${deploymentId}`);

  // Stop container if running
  if (record.containerId && record.status !== 'stopped' && record.status !== 'failed') {
    try {
      await execDocker(['rm', '-f', record.containerId]);
    } catch {
      // Container may not exist
    }
  }

  // Remove from cache
  deploymentCache.delete(deploymentId);

  // Delete DB record
  await repo.delete(deploymentId);

  appLogger.info(`${LOG_TAG} Deleted deployment ${deploymentId}`);
}

/* ------------------------------------------------------------------ */
/*  State recovery on startup                                         */
/* ------------------------------------------------------------------ */

export async function recoverDeployments(): Promise<void> {
  appLogger.info(`${LOG_TAG} Recovering deployments...`);

  let repo;
  try {
    repo = await getDeploymentRepo();
  } catch (err) {
    appLogger.warn(`${LOG_TAG} Deployment repository not available — skipping recovery`, err);
    return;
  }

  const all: DeploymentRecord[] = await repo.listAll();
  const active = all.filter(
    (d: DeploymentRecord) => d.status !== 'stopped' && d.status !== 'failed',
  );

  // Discover running serve containers
  let runningContainerIds = new Set<string>();
  try {
    const { stdout } = await execDocker(['ps', '-q', '--filter', 'name=automl-serve-']);
    runningContainerIds = new Set(stdout.trim().split('\n').filter(Boolean));
  } catch {
    // Docker may not be available
  }

  let recovered = 0;
  let failed = 0;

  for (const deployment of active) {
    const isRunning = deployment.containerId
      ? runningContainerIds.has(deployment.containerId) || runningContainerIds.has(deployment.containerId.slice(0, 12))
      : false;

    if (isRunning && deployment.containerId && deployment.port) {
      // Container is running — rebuild cache entry
      deploymentCache.set(deployment.deploymentId, {
        deploymentId: deployment.deploymentId,
        modelId: deployment.modelId,
        projectId: deployment.projectId,
        containerId: deployment.containerId,
        port: deployment.port,
        status: deployment.status,
        consecutiveFailures: 0,
      });
      recovered++;
    } else {
      // Container is not running — check age
      const ageMs = Date.now() - new Date(deployment.createdAt).getTime();
      if (ageMs > STALE_CREATING_THRESHOLD_MS) {
        await updateDeploymentStatus(deployment.deploymentId, 'failed', {
          errorMessage: 'Container not found after server restart',
        });
        failed++;
      } else {
        await updateDeploymentStatus(deployment.deploymentId, 'stopped');
      }
    }

    // Remove from running set so we can detect orphans
    if (deployment.containerId) {
      runningContainerIds.delete(deployment.containerId);
      runningContainerIds.delete(deployment.containerId.slice(0, 12));
    }
  }

  // Kill orphan serve containers with no DB entry
  if (runningContainerIds.size > 0) {
    const orphanIds = [...runningContainerIds];
    appLogger.warn(`${LOG_TAG} Killing ${orphanIds.length} orphan serve container(s)`);
    try {
      await execDocker(['rm', '-f', ...orphanIds]);
    } catch (err) {
      appLogger.error(`${LOG_TAG} Failed to kill orphan containers`, err);
    }
  }

  appLogger.info(`${LOG_TAG} Recovery complete: ${recovered} recovered, ${failed} marked failed`);
}

/* ------------------------------------------------------------------ */
/*  Shutdown cleanup                                                  */
/* ------------------------------------------------------------------ */

export async function destroyAllDeploymentContainers(): Promise<void> {
  stopHealthCheckLoop();

  try {
    const { stdout } = await execDocker(['ps', '-aq', '--filter', 'name=automl-serve-']);
    const ids = stdout.trim().split('\n').filter(Boolean);
    if (ids.length > 0) {
      await execDocker(['rm', '-f', ...ids]);
      appLogger.info(`${LOG_TAG} Destroyed ${ids.length} deployment container(s)`);
    }
  } catch (err) {
    appLogger.error(`${LOG_TAG} Failed to destroy deployment containers`, err);
  }

  deploymentCache.clear();
}

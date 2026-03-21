/**
 * Container Manager
 *
 * Manages Docker containers for sandboxed Python code execution.
 * Provides container pooling, lifecycle management, and resource limits.
 */

import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { promisify } from 'util';

import { env } from '../config.js';
import { appLogger } from '../logging/logger.js';

import {
    cleanupStaleContainers,
    cleanupOrphanedWorkspaces,
    destroyAllContainers as destroyAllContainersImpl,
    killOrphanedContainers,
} from './container/containerCleanup.js';
import { buildDockerRunArgs } from './container/dockerBuilder.js';
import { ensureRuntimeImage } from './container/imageManager.js';
export type { Container, ContainerConfig } from './container/types.js';
import type { Container, ContainerConfig } from './container/types.js';
import { execDocker } from './dockerUtils.js';
import { shutdownKernel } from './kernelManager.js';

const execAsync = promisify(exec);

// Active containers cache
const containers = new Map<string, Container>();

/**
 * Check if Docker is available and running
 */
export async function isDockerAvailable(): Promise<boolean> {
    if (!env.dockerEnabled) return false;

    try {
        await execDocker(['info']);
        return true;
    } catch {
        return false;
    }
}

/**
 * Create a new container for code execution
 */
export async function createContainer(config: ContainerConfig): Promise<Container> {
    const id = randomUUID();
    // Normalize to an absolute path so subsequent file operations are consistent even if the
    // backend is launched from different working directories (dev vs prod, tests, etc.).
    const workspacePath = resolve(config.workspacePath);

    // Create workspace directory
    await mkdir(workspacePath, { recursive: true });

    // Create datasets directory in workspace
    const datasetsPath = join(workspacePath, 'datasets');
    await mkdir(datasetsPath, { recursive: true });
    await mkdir(join(workspacePath, '.python'), { recursive: true });
    await mkdir(join(workspacePath, '.tmp'), { recursive: true });
    await mkdir(join(workspacePath, '.cache', 'pip'), { recursive: true });

    // Build docker run command with security constraints
    const imageName = await ensureRuntimeImage(config.pythonVersion);
    const containerName = `automl-exec-${id.slice(0, 8)}`;

    const dockerArgs = buildDockerRunArgs({
        containerName,
        imageName,
        workspacePath,
    });

    try {
        const { stdout } = await execDocker(dockerArgs);
        const containerId = stdout.trim();

        // Read the mapped Kernel Gateway port
        let kernelGatewayPort = 0;
        try {
            const { stdout: portOutput } = await execDocker(['port', containerId.slice(0, 12), '8888']);
            const portMatch = portOutput.match(/:(\d+)/);
            kernelGatewayPort = portMatch ? parseInt(portMatch[1], 10) : 0;
        } catch {
            appLogger.warn('[containerManager] Could not read Kernel Gateway port mapping');
        }

        const container: Container = {
            id,
            containerId,
            projectId: config.projectId,
            pythonVersion: config.pythonVersion,
            workspacePath,
            kernelGatewayPort,
            createdAt: new Date(),
            lastUsedAt: new Date()
        };

        containers.set(id, container);
        appLogger.info(`[containerManager] Created container ${containerName} (${containerId.slice(0, 12)})`);

        // Wait for Kernel Gateway to be ready
        if (kernelGatewayPort > 0) {
            const maxWait = env.kernelStartupTimeoutMs;
            const start = Date.now();
            let ready = false;
            while (Date.now() - start < maxWait) {
                try {
                    const healthRes = await fetch(`http://127.0.0.1:${kernelGatewayPort}/api/kernelspecs`);
                    await healthRes.text().catch(() => {});
                    if (healthRes.ok) { ready = true; break; }
                } catch {
                    // Not ready yet
                }
                await new Promise(r => setTimeout(r, 500));
            }
            if (!ready) {
                throw new Error(
                    `Kernel Gateway on container ${containerName} did not become ready within ${maxWait}ms`,
                );
            }
        }

        return container;
    } catch (error) {
        // Clean up workspace on failure
        await rm(workspacePath, { recursive: true, force: true }).catch(() => { });
        throw new Error(`Failed to create container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Destroy a container and clean up resources
 */
export async function destroyContainer(containerId: string): Promise<void> {
    const container = containers.get(containerId);
    if (!container) return;

    try {
        // Shut down kernel before destroying container (keyed on container.id, not Docker containerId)
        await shutdownKernel({ id: container.id, kernelGatewayPort: container.kernelGatewayPort }).catch(() => {});

        // Stop and remove container
        await execAsync(`docker rm -f ${container.containerId}`).catch(() => { });

        // Clean up workspace
        await rm(container.workspacePath, { recursive: true, force: true }).catch(() => { });

        containers.delete(containerId);
        appLogger.info(`[containerManager] Destroyed container ${container.containerId.slice(0, 12)}`);
    } catch (error) {
        appLogger.error(`[containerManager] Failed to destroy container: ${error}`);
    }
}

/**
 * Get container by ID
 */
export function getContainer(id: string): Container | undefined {
    return containers.get(id);
}

/**
 * Get or create container for a project
 */
export async function getOrCreateContainer(config: ContainerConfig): Promise<Container> {
    // Look for existing container for this project
    for (const container of containers.values()) {
        if (
            container.projectId === config.projectId &&
            container.pythonVersion === config.pythonVersion
        ) {
            // Guard against stale in-memory state where the workspace directory was deleted
            // (e.g. manual cleanup or previous crash). If the workspace is missing, recreate
            // the container so execution can proceed.
            const workspacePath = resolve(container.workspacePath);
            if (!existsSync(workspacePath)) {
                appLogger.warn('[containerManager] Workspace missing for active container; recreating container:', {
                    containerId: container.containerId,
                    workspacePath
                });
                await destroyContainer(container.id);
                break;
            }

            // Normalize stored path to absolute.
            container.workspacePath = workspacePath;
            container.lastUsedAt = new Date();
            return container;
        }
    }

    // Create new container
    return createContainer(config);
}

/**
 * Destroy all tracked containers. Called on server shutdown.
 */
export async function destroyAllContainers(): Promise<void> {
    await destroyAllContainersImpl(containers, destroyContainer);
}

// Run cleanup every 5 minutes
setInterval(() => cleanupStaleContainers(containers, destroyContainer), 5 * 60 * 1000);

/**
 * Initialize container manager - cleans up orphaned containers and workspaces.
 * Must be called before accepting any execution requests.
 */
export async function initializeContainerManager(): Promise<void> {
    appLogger.info('[containerManager] Initializing...');

    // Clean up any orphaned containers from previous runs
    const cleaned = await killOrphanedContainers();

    // Clean up orphaned workspace directories
    await cleanupOrphanedWorkspaces();

    appLogger.info(`[containerManager] Initialization complete (cleaned ${cleaned} containers)`);
}

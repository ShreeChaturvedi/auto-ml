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
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

import { env } from '../config.js';
import type { PythonVersion } from '../types/execution.js';

import { buildDockerRunArgs } from './container/dockerBuilder.js';
import { execDocker } from './dockerUtils.js';
import { shutdownKernel } from './kernelManager.js';
import { clearJediInstallState } from './pythonCompletions.js';

const execAsync = promisify(exec);

function resolveRuntimeDockerfilePath(): string {
    const candidates = [
        resolve(process.cwd(), 'docker', 'Dockerfile.python-runtime'),
        resolve(process.cwd(), 'backend', 'docker', 'Dockerfile.python-runtime'),
        fileURLToPath(new URL('../../docker/Dockerfile.python-runtime', import.meta.url))
    ];

    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const runtimeDockerfilePath = resolveRuntimeDockerfilePath();
const runtimeDockerContext = resolve(dirname(runtimeDockerfilePath));
const imageBuilds = new Map<string, Promise<void>>();

export interface ContainerConfig {
    projectId: string;
    pythonVersion: PythonVersion;
    datasetPaths?: string[];
    workspacePath: string;
}

export interface Container {
    id: string;
    containerId: string;
    projectId: string;
    pythonVersion: PythonVersion;
    workspacePath: string;
    kernelGatewayPort: number;
    createdAt: Date;
    lastUsedAt: Date;
}

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
 * Get Docker image name for Python version
 */
function getImageName(pythonVersion: PythonVersion): string {
    const image = env.dockerImage;
    if (image.includes('{pythonVersion}')) {
        return image.replace('{pythonVersion}', pythonVersion);
    }

    if (image.includes(':')) {
        const [repo, tag] = image.split(':');
        if (tag === 'latest') {
            return `${repo}:${pythonVersion}`;
        }
        return image;
    }

    return `${image}:${pythonVersion}`;
}

function getLatestTag(imageName: string): string | null {
    if (!imageName.includes(':')) return null;
    const [repo, tag] = imageName.split(':');
    if (tag === 'latest') return imageName;
    return `${repo}:latest`;
}

async function isImageAvailable(imageName: string): Promise<boolean> {
    try {
        await execDocker(['image', 'inspect', imageName]);
        return true;
    } catch {
        return false;
    }
}

async function ensureRuntimeImage(pythonVersion: PythonVersion): Promise<string> {
    const imageName = getImageName(pythonVersion);
    const available = await isImageAvailable(imageName);
    if (available) return imageName;

    if (!env.executionAutoBuildImage) {
        throw new Error(`Docker image "${imageName}" is missing. Build it with backend/docker/build-runtime.sh.`);
    }

    const existingBuild = imageBuilds.get(imageName);
    if (existingBuild) {
        await existingBuild;
        return imageName;
    }

    const buildPromise = (async () => {
        const tags = new Set<string>([imageName]);
        const latestTag = getLatestTag(imageName);
        if (latestTag) {
            tags.add(latestTag);
        }

        console.log(`[containerManager] Building runtime image: ${imageName}`);
        const buildArgs = ['build', '--build-arg', `PYTHON_VERSION=${pythonVersion}`];
        if (env.executionDockerPlatform) {
            buildArgs.push('--platform', env.executionDockerPlatform);
        }
        Array.from(tags).forEach((tag) => {
            buildArgs.push('-t', tag);
        });
        buildArgs.push('-f', runtimeDockerfilePath, runtimeDockerContext);
        await execDocker(buildArgs);
    })();

    imageBuilds.set(imageName, buildPromise);

    try {
        await buildPromise;
    } finally {
        imageBuilds.delete(imageName);
    }

    return imageName;
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
            console.warn('[containerManager] Could not read Kernel Gateway port mapping');
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
        console.log(`[containerManager] Created container ${containerName} (${containerId.slice(0, 12)})`);

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
        console.log(`[containerManager] Destroyed container ${container.containerId.slice(0, 12)}`);
    } catch (error) {
        console.error(`[containerManager] Failed to destroy container: ${error}`);
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
                console.warn('[containerManager] Workspace missing for active container; recreating container:', {
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
 * Clean up stale containers (older than 30 minutes of inactivity)
 */
async function cleanupStaleContainers(): Promise<void> {
    const staleThreshold = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    for (const [id, container] of containers.entries()) {
        if (now - container.lastUsedAt.getTime() > staleThreshold) {
            await destroyContainer(id);
        }
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupStaleContainers, 5 * 60 * 1000);

/**
 * Kill all Docker containers matching our naming pattern.
 * Called on server startup to clean up orphaned containers from previous runs.
 */
async function killOrphanedContainers(): Promise<number> {
    try {
        // Find all containers matching our pattern (including stopped ones)
        const { stdout } = await execDocker([
            'ps', '-a', '-q',
            '--filter', 'name=automl-exec-'
        ]);

        const containerIds = stdout.trim().split('\n').filter(Boolean);

        if (containerIds.length === 0) {
            console.log('[containerManager] No orphaned containers found');
            return 0;
        }

        console.log(`[containerManager] Found ${containerIds.length} orphaned container(s), cleaning up...`);

        // Force remove all matching containers
        await execDocker(['rm', '-f', ...containerIds]);

        console.log(`[containerManager] Cleaned up ${containerIds.length} orphaned container(s)`);
        return containerIds.length;
    } catch (error) {
        // Ignore errors - containers may already be gone or Docker unavailable
        console.warn('[containerManager] Error cleaning up orphaned containers:', error);
        return 0;
    }
}

/**
 * Destroy all tracked containers. Called on server shutdown.
 */
export async function destroyAllContainers(): Promise<void> {
    const containerList = Array.from(containers.entries());

    if (containerList.length === 0) {
        return;
    }

    console.log(`[containerManager] Destroying ${containerList.length} active container(s)...`);

    await Promise.all(
        containerList.map(([id]) => destroyContainer(id).catch(() => {}))
    );

    // Clear the jedi tracking set too
    clearJediInstallState();

    console.log('[containerManager] All containers destroyed');
}

/**
 * Clean up workspace directories that have no associated running container.
 */
async function cleanupOrphanedWorkspaces(): Promise<void> {
    try {
        const workspacesDir = resolve(env.executionWorkspaceDir);
        const { readdir } = await import('fs/promises');

        if (!existsSync(workspacesDir)) {
            return;
        }

        const entries = await readdir(workspacesDir);

        if (entries.length === 0) {
            return;
        }

        // Remove all workspace directories since we just cleaned all containers
        for (const entry of entries) {
            const entryPath = join(workspacesDir, entry);
            await rm(entryPath, { recursive: true, force: true }).catch(() => {});
        }

        console.log(`[containerManager] Cleaned up ${entries.length} orphaned workspace(s)`);
    } catch (error) {
        console.warn('[containerManager] Error cleaning up orphaned workspaces:', error);
    }
}

/**
 * Initialize container manager - cleans up orphaned containers and workspaces.
 * Must be called before accepting any execution requests.
 */
export async function initializeContainerManager(): Promise<void> {
    console.log('[containerManager] Initializing...');

    // Clean up any orphaned containers from previous runs
    const cleaned = await killOrphanedContainers();

    // Clean up orphaned workspace directories
    await cleanupOrphanedWorkspaces();

    console.log(`[containerManager] Initialization complete (cleaned ${cleaned} containers)`);
}

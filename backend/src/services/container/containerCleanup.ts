/**
 * Container Cleanup
 *
 * Periodic and on-demand cleanup of stale/orphaned Docker containers
 * and their associated workspace directories.
 */

import { existsSync } from 'fs';
import { readdir, rm } from 'fs/promises';
import { resolve } from 'path';
import { join } from 'path';

import { env } from '../../config.js';
import { execDocker } from '../dockerUtils.js';
import { clearJediInstallState } from '../pythonCompletions.js';

import type { Container } from './types.js';

/**
 * Clean up stale containers (older than 30 minutes of inactivity)
 */
export async function cleanupStaleContainers(
    containers: Map<string, Container>,
    destroyContainer: (id: string) => Promise<void>
): Promise<void> {
    const staleThreshold = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    for (const [id, container] of containers.entries()) {
        if (now - container.lastUsedAt.getTime() > staleThreshold) {
            await destroyContainer(id);
        }
    }
}

/**
 * Kill all Docker containers matching our naming pattern.
 * Called on server startup to clean up orphaned containers from previous runs.
 */
export async function killOrphanedContainers(): Promise<number> {
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
 * Clean up workspace directories that have no associated running container.
 */
export async function cleanupOrphanedWorkspaces(): Promise<void> {
    try {
        const workspacesDir = resolve(env.executionWorkspaceDir);

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
 * Destroy all tracked containers. Called on server shutdown.
 */
export async function destroyAllContainers(
    containers: Map<string, Container>,
    destroyContainer: (id: string) => Promise<void>
): Promise<void> {
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

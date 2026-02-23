/**
 * Execution Service
 * 
 * Orchestrates Python code execution with Docker-backed cloud runtime.
 */

import { randomUUID } from 'crypto';
import type {
    ExecutionRequest,
    ExecutionResult,
    ExecutionSession,
    PackageInfo,
    PythonVersion,
    RichOutput
} from '../types/execution.js';
import { DEFAULT_PACKAGES } from '../types/execution.js';
import {
    isDockerAvailable,
    getOrCreateContainer,
    executeInContainer,
    installPackage as containerInstallPackage,
    installPackageStream as containerInstallPackageStream,
    listPackages as containerListPackages,
    destroyContainer,
    getContainer,
    type PackageInstallEvent
} from './containerManager.js';
import { syncWorkspaceDatasets } from './executionWorkspace.js';
import { env } from '../config.js';

// Active sessions cache
const sessions = new Map<string, ExecutionSession>();

/**
 * Create a new execution session
 */
export async function createSession(
    projectId: string,
    pythonVersion: PythonVersion = '3.11',
    options: { requireDocker?: boolean } = {}
): Promise<ExecutionSession> {
    const id = randomUUID();

    const session: ExecutionSession = {
        id,
        projectId,
        pythonVersion,
        installedPackages: DEFAULT_PACKAGES.map((name) => ({ name })),
        createdAt: new Date(),
        lastUsedAt: new Date()
    };

    // If Docker is available, pre-create container
    const dockerAvailable = await isDockerAvailable();
    if (options.requireDocker && !dockerAvailable) {
        throw new Error('Docker runtime is unavailable. Start Docker and rebuild the runtime image.');
    }
    if (dockerAvailable) {
        try {
            const container = await getOrCreateContainer({
                projectId,
                pythonVersion,
                workspacePath: `${env.executionWorkspaceDir}/${projectId}/${id}`
            });
            session.containerId = container.id;
            session.workspacePath = container.workspacePath;
            await syncWorkspaceDatasets(projectId, container.workspacePath).catch((error) => {
                console.warn('[executionService] Failed to sync datasets:', error);
            });
            try {
                session.installedPackages = await containerListPackages(container);
            } catch (error) {
                console.warn('[executionService] Failed to read installed packages:', error);
            }
        } catch (error) {
            if (options.requireDocker) {
                throw error;
            }
            console.warn('[executionService] Docker container creation failed:', error);
        }
    }

    sessions.set(id, session);
    console.log(`[executionService] Created session ${id} for project ${projectId}`);

    return session;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): ExecutionSession | undefined {
    return sessions.get(sessionId);
}

/**
 * Execute code in a session
 */
export async function executeCode(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    const dockerAvailable = await isDockerAvailable();

    let session: ExecutionSession | undefined;

    // Get or create session
    if (request.sessionId) {
        session = sessions.get(request.sessionId);
    }

    if (!session) {
        if (!dockerAvailable) {
            return buildErrorResult('Docker runtime is unavailable. Start Docker to run code in cloud mode.', startTime);
        }

        session = await createSession(
            request.projectId,
            request.pythonVersion || '3.11',
            { requireDocker: true }
        );
    }

    session.lastUsedAt = new Date();

    if (!session.containerId) {
        return buildErrorResult('No active container for this session.', startTime);
    }

    let container = getContainer(session.containerId);
    if (!container) {
        try {
            container = await getOrCreateContainer({
                projectId: session.projectId,
                pythonVersion: session.pythonVersion,
                workspacePath: session.workspacePath ?? `${env.executionWorkspaceDir}/${session.projectId}/${session.id}`
            });
            session.containerId = container.id;
            session.workspacePath = container.workspacePath;
        } catch (error) {
            console.warn('[executionService] Container recreation failed:', error);
            return buildErrorResult('Failed to create a runtime container.', startTime);
        }
    }

    if (session.workspacePath) {
        await syncWorkspaceDatasets(session.projectId, session.workspacePath).catch((error) => {
            console.warn('[executionService] Failed to sync datasets:', error);
        });
    }

    try {
        return await executeInContainer(
            container,
            request.code,
            request.timeout || env.executionTimeoutMs,
            { executionId: randomUUID().slice(0, 8) }
        );
    } catch (error) {
        console.warn('[executionService] Container execution failed:', error);
        return buildErrorResult('Python execution failed inside the runtime container.', startTime);
    }
}

function buildErrorResult(message: string, startTime: number): ExecutionResult {
    const outputs: RichOutput[] = [{ type: 'error', content: message }];

    return {
        status: 'error',
        stdout: '',
        stderr: message,
        outputs,
        executionMs: Date.now() - startTime,
        error: message
    };
}

/**
 * Install a package in a session
 */
export async function installPackage(
    sessionId: string,
    packageName: string
): Promise<{ success: boolean; message: string }> {
    const session = sessions.get(sessionId);
    if (!session) {
        return { success: false, message: 'Session not found' };
    }

    if (!session.containerId) {
        return {
            success: false,
            message: 'Cloud runtime is unavailable for this session.'
        };
    }

    const container = getContainer(session.containerId);
    if (!container) {
        return { success: false, message: 'Container not found' };
    }

    const result = await containerInstallPackage(container, packageName);
    if (result.success) {
        session.installedPackages = await containerListPackages(container);
    }

    return result;
}

export async function installPackageWithProgress(
    sessionId: string,
    packageName: string,
    onEvent: (event: PackageInstallEvent) => void
): Promise<{ success: boolean; message: string }> {
    const session = sessions.get(sessionId);
    if (!session) {
        return { success: false, message: 'Session not found' };
    }

    if (!session.containerId) {
        return {
            success: false,
            message: 'Cloud runtime is unavailable for this session.'
        };
    }

    const container = getContainer(session.containerId);
    if (!container) {
        return { success: false, message: 'Container not found' };
    }

    const result = await containerInstallPackageStream(container, packageName, onEvent);
    if (result.success) {
        session.installedPackages = await containerListPackages(container);
    }

    return result;
}

/**
 * List packages in a session
 */
export async function listPackages(sessionId: string): Promise<PackageInfo[]> {
    const session = sessions.get(sessionId);
    if (!session) {
        return [];
    }

    if (!session.containerId) {
        return session.installedPackages;
    }

    const container = getContainer(session.containerId);
    if (!container) {
        return session.installedPackages;
    }

    const packages = await containerListPackages(container);
    session.installedPackages = packages;
    return packages;
}

/**
 * Get available runtimes
 */
export async function getAvailableRuntimes(): Promise<Array<{
    pythonVersion: PythonVersion;
    available: boolean;
    dockerEnabled: boolean;
}>> {
    const dockerAvailable = await isDockerAvailable();

    return [
        {
            pythonVersion: '3.10',
            available: dockerAvailable,
            dockerEnabled: dockerAvailable
        },
        {
            pythonVersion: '3.11',
            available: dockerAvailable,
            dockerEnabled: dockerAvailable
        }
    ];
}

/**
 * Destroy a session
 */
export async function destroySession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) return;

    if (session.containerId) {
        await destroyContainer(session.containerId);
    }

    sessions.delete(sessionId);
    console.log(`[executionService] Destroyed session ${sessionId}`);
}

/**
 * Check execution service health
 */
export async function getHealth(): Promise<{
    status: 'healthy' | 'degraded';
    dockerAvailable: boolean;
    activeSessions: number;
}> {
    const dockerAvailable = await isDockerAvailable();

    return {
        status: dockerAvailable ? 'healthy' : 'degraded',
        dockerAvailable,
        activeSessions: sessions.size
    };
}

/**
 * Execution API Client
 *
 * API client for cloud (Docker) code execution.
 */

import { apiFetch, apiRequest } from './client';
import { readNdjsonStream } from './streamReader';

// Re-export PyPI types and functions for backward compatibility
export type { PyPIPackageDetails } from './pypi';
export { fetchPyPIPackageDetails } from './pypi';

// ============================================================
// Execution Types (cloud-only)
// ============================================================

export type PythonVersion = '3.10' | '3.11';
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'timeout';

export interface RichOutput {
    type: 'text' | 'table' | 'image' | 'html' | 'error' | 'warning' | 'chart';
    content: string;
    data?: unknown;
    mimeType?: string;
}

export interface ExecutionResult {
    status: ExecutionStatus;
    stdout: string;
    stderr: string;
    outputs: RichOutput[];
    executionMs: number;
    error?: string;
    cached?: boolean;
}

export interface PackageInfo {
    name: string;
    version?: string;
    summary?: string;
    homepage?: string;
}

export interface PackageInstallEvent {
    type: 'progress' | 'log' | 'done';
    progress?: number;
    stage?: string;
    message?: string;
    success?: boolean;
}

export interface ExecuteRequest {
    projectId: string;
    code: string;
    sessionId?: string;
    pythonVersion?: PythonVersion;
    timeout?: number;
}

export interface SessionInfo {
    id: string;
    projectId: string;
    pythonVersion: PythonVersion;
    installedPackages: PackageInfo[];
    createdAt: string;
    lastUsedAt: string;
}

export interface RuntimeInfo {
    pythonVersion: PythonVersion;
    available: boolean;
    dockerEnabled: boolean;
}

/**
 * Execute code via cloud runtime (Docker)
 */
export async function executeCode(request: ExecuteRequest): Promise<ExecutionResult> {
    const response = await apiRequest<{ success: boolean; result: ExecutionResult }>(
        '/execute',
        {
            method: 'POST',
            body: request
        }
    );
    return response.result;
}

/**
 * Create a new execution session
 */
export async function createSession(
    projectId: string,
    pythonVersion?: PythonVersion
): Promise<SessionInfo> {
    const response = await apiRequest<{ success: boolean; session: SessionInfo }>(
        '/execute/session',
        {
            method: 'POST',
            body: { projectId, pythonVersion }
        }
    );
    return response.session;
}

/**
 * Get session details
 */
export async function getSession(sessionId: string): Promise<SessionInfo | null> {
    try {
        const response = await apiRequest<{ session: SessionInfo }>(
            `/execute/session/${sessionId}`
        );
        return response.session;
    } catch {
        return null;
    }
}

/**
 * Destroy a session
 */
export async function destroySession(sessionId: string): Promise<void> {
    await apiRequest(`/execute/session/${sessionId}`, { method: 'DELETE' });
}

/**
 * Install a package in a session
 */
export async function installPackage(
    sessionId: string,
    packageName: string
): Promise<{ success: boolean; message: string }> {
    return apiRequest('/execute/packages', {
        method: 'POST',
        body: { sessionId, packageName }
    });
}

/**
 * Install package with progress streaming (NDJSON)
 */
export async function installPackageStream(
    sessionId: string,
    packageName: string,
    onEvent: (event: PackageInstallEvent) => void
): Promise<{ success: boolean; message: string }> {
    const response = await apiFetch('/execute/packages/stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson'
        },
        body: { sessionId, packageName }
    });

    if (!response.ok || !response.body) {
        const fallback = await response.text().catch(() => '');
        throw new Error(fallback || `Failed to install package (${response.status})`);
    }

    let finalResult: { success: boolean; message: string } | null = null;

    try {
        for await (const event of readNdjsonStream<PackageInstallEvent>(response)) {
            if (event.type === 'done') {
                finalResult = {
                    success: Boolean(event.success),
                    message: event.message ?? ''
                };
            }
            onEvent(event);
        }
    } catch {
        // Ignore malformed lines/tail
    }

    if (finalResult) {
        return finalResult;
    }

    return {
        success: false,
        message: 'Package installation did not return a result.'
    };
}

/**
 * List installed packages in a session
 */
export async function listPackages(sessionId: string): Promise<PackageInfo[]> {
    const response = await apiRequest<{ packages: PackageInfo[] }>(
        `/execute/packages/${sessionId}`
    );
    return response.packages;
}

/**
 * Search PyPI packages for autocomplete
 */
export async function searchPackages(
    query: string,
    limit = 8
): Promise<PackageInfo[]> {
    const params = new URLSearchParams();
    if (query) {
        params.set('q', query);
    }
    params.set('limit', `${limit}`);

    const response = await apiRequest<{ suggestions: PackageInfo[] }>(
        `/execute/packages/suggest?${params.toString()}`
    );
    return response.suggestions;
}

/**
 * Get available Python runtimes
 */
export async function getRuntimes(): Promise<RuntimeInfo[]> {
    const response = await apiRequest<{ runtimes: RuntimeInfo[] }>(
        '/execute/runtimes'
    );
    return response.runtimes;
}

/**
 * Check execution service health
 */
export async function getExecutionHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'error';
    dockerAvailable: boolean;
    activeSessions: number;
}> {
    try {
        return await apiRequest('/execute/health');
    } catch {
        return {
            status: 'error',
            dockerAvailable: false,
            activeSessions: 0
        };
    }
}

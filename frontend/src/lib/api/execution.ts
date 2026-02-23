/**
 * Execution API Client
 *
 * API client for cloud (Docker) code execution.
 */

import { apiRequest, getApiBaseUrl } from './client';
import { useAuthStore } from '@/stores/authStore';

// ============================================================
// Execution Types (cloud-only)
// ============================================================

export type PythonVersion = '3.10' | '3.11';
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'timeout';

export interface RichOutput {
    type: 'text' | 'table' | 'image' | 'html' | 'error' | 'chart';
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
            body: JSON.stringify(request)
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
            body: JSON.stringify({ projectId, pythonVersion })
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
        body: JSON.stringify({ sessionId, packageName })
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
    const authState = useAuthStore.getState();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson'
    };

    if (authState.accessToken) {
        headers.Authorization = `Bearer ${authState.accessToken}`;
    }

    const response = await fetch(`${getApiBaseUrl()}/execute/packages/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, packageName })
    });

    if (!response.ok || !response.body) {
        const fallback = await response.text().catch(() => '');
        throw new Error(fallback || `Failed to install package (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: { success: boolean; message: string } | null = null;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const event = JSON.parse(trimmed) as PackageInstallEvent;
                if (event.type === 'done') {
                    finalResult = {
                        success: Boolean(event.success),
                        message: event.message ?? ''
                    };
                }
                onEvent(event);
            } catch {
                // Ignore malformed lines
            }
        }
    }

    if (buffer.trim()) {
        try {
            const event = JSON.parse(buffer.trim()) as PackageInstallEvent;
            if (event.type === 'done') {
                finalResult = {
                    success: Boolean(event.success),
                    message: event.message ?? ''
                };
            }
            onEvent(event);
        } catch {
            // Ignore malformed tail
        }
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

/**
 * Detailed package info from PyPI
 */
export interface PyPIPackageDetails {
    name: string;
    version: string;
    summary: string;
    description: string;
    author: string;
    authorEmail: string;
    license: string;
    licenseName: string; // Extracted from classifiers (e.g., "MIT License")
    homepage: string;
    projectUrl: string;
    packageUrl: string;
    requiresPython: string;
    pythonVersions: string[]; // Extracted from classifiers (e.g., ["3.10", "3.11", "3.12"])
    keywords: string[];
    classifiers: string[];
    size: number; // bytes
    uploadTime: string;
}

/**
 * Fetch detailed package info directly from PyPI JSON API
 */
export async function fetchPyPIPackageDetails(
    packageName: string,
    version?: string
): Promise<PyPIPackageDetails | null> {
    try {
        const url = version
            ? `https://pypi.org/pypi/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}/json`
            : `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;

        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const info = data.info;

        // Get the latest release file size
        let size = 0;
        const releases = data.urls || [];
        if (releases.length > 0) {
            // Prefer wheel, then source dist
            const wheel = releases.find((r: { packagetype: string }) => r.packagetype === 'bdist_wheel');
            const sdist = releases.find((r: { packagetype: string }) => r.packagetype === 'sdist');
            const release = wheel || sdist || releases[0];
            size = release?.size || 0;
        }

        // Extract Python versions from classifiers
        // e.g., "Programming Language :: Python :: 3.11" -> "3.11"
        const classifiers: string[] = info.classifiers || [];
        const pythonVersions: string[] = [];
        for (const classifier of classifiers) {
            const match = classifier.match(/^Programming Language :: Python :: (\d+\.\d+)$/);
            if (match) {
                pythonVersions.push(match[1]);
            }
        }
        // Sort versions numerically
        pythonVersions.sort((a, b) => {
            const [aMajor, aMinor] = a.split('.').map(Number);
            const [bMajor, bMinor] = b.split('.').map(Number);
            return aMajor !== bMajor ? aMajor - bMajor : aMinor - bMinor;
        });

        // Extract license name from classifiers
        // e.g., "License :: OSI Approved :: MIT License" -> "MIT License"
        let licenseName = '';
        for (const classifier of classifiers) {
            if (classifier.startsWith('License :: ')) {
                // Get the last part after ::
                const parts = classifier.split(' :: ');
                licenseName = parts[parts.length - 1];
                break;
            }
        }
        // Fallback to license field if it's short (just a name, not full text)
        if (!licenseName && info.license && info.license.length < 50) {
            licenseName = info.license;
        }

        return {
            name: info.name || packageName,
            version: info.version || '',
            summary: info.summary || '',
            description: info.description || '',
            author: info.author || '',
            authorEmail: info.author_email || '',
            license: info.license || '',
            licenseName,
            homepage: info.home_page || info.project_url || '',
            projectUrl: info.project_url || `https://pypi.org/project/${packageName}/`,
            packageUrl: info.package_url || `https://pypi.org/project/${packageName}/`,
            requiresPython: info.requires_python || '',
            pythonVersions,
            keywords: info.keywords ? info.keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [],
            classifiers,
            size,
            uploadTime: releases[0]?.upload_time || ''
        };
    } catch (error) {
        console.warn('[execution] Failed to fetch PyPI package details:', error);
        return null;
    }
}

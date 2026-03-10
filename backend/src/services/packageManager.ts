/**
 * Package Manager
 *
 * Handles pip package installation, uninstallation, and listing
 * within Docker containers used for sandboxed Python execution.
 */

import { spawn } from 'child_process';

import type { PackageInfo } from '../types/execution.js';

import type { Container } from './containerManager.js';
import { execDocker } from './dockerUtils.js';

const PACKAGE_ALIASES = new Map<string, string>([['pytorch', 'torch']]);
const CONTAINER_PYTHON_SITE_DIR = '/workspace/.python';

export type PackageInstallEvent = {
    type: 'progress' | 'log';
    progress?: number;
    stage?: string;
    message?: string;
};

const PIP_INSTALL_TIMEOUT_MS = 8 * 60 * 1000;
const INSTALL_TIMEOUT_MESSAGE = 'Install timed out while waiting for pip process to finish.';

/** Build the common pip-install docker-exec argument prefix for a container. */
function pipInstallBaseArgs(containerId: string): string[] {
    return [
        'exec', containerId,
        'python', '-m', 'pip', 'install',
        '--prefer-binary', '--no-cache-dir',
        '--target', CONTAINER_PYTHON_SITE_DIR,
    ];
}

function isMissingBinaryError(details: string): boolean {
    return (
        details.includes('No matching distribution found') ||
        details.includes('Could not find a version that satisfies') ||
        details.includes('No compatible wheels')
    );
}

function isInstallTimeoutError(details: string): boolean {
    return details.includes(INSTALL_TIMEOUT_MESSAGE);
}

export function normalizePackageInput(input: string): { requirements: string[]; aliasNotice: string } {
    const trimmed = input.trim();
    if (!trimmed) {
        return { requirements: [], aliasNotice: '' };
    }

    const tokens = trimmed
        .split(',')
        .flatMap((chunk) => chunk.trim().split(/\s+/))
        .map((token) => token.trim())
        .filter(Boolean);

    const notices = new Set<string>();
    const requirements = tokens.map((token) => {
        const match = /^([A-Za-z0-9._-]+)(.*)$/.exec(token);
        if (!match) return token;
        const base = match[1] ?? token;
        const suffix = match[2] ?? '';
        const normalizedBase = base.toLowerCase().replace(/_/g, '-');
        const alias = PACKAGE_ALIASES.get(normalizedBase);
        if (!alias) return token;
        notices.add(`"${base}" installs as "${alias}".`);
        return `${alias}${suffix}`;
    });

    return {
        requirements,
        aliasNotice: notices.size > 0 ? `Note: ${Array.from(notices).join(' ')} ` : ''
    };
}

export function formatInstallError(details: string, requirements: string[]): string {
    if (!details) {
        return `Failed to install ${requirements.join(', ')}.`;
    }
    if (
        details.includes('No space left on device') ||
        details.includes('Errno 28')
    ) {
        return 'Install ran out of disk space in the runtime.'
            + ' Increase `EXECUTION_TMPFS_MB` or clean up runtime storage and try again.';
    }
    if (isInstallTimeoutError(details)) {
        return 'Install timed out while waiting for pip to finish.'
            + ' Retry, or use a narrower version spec / lighter dependency set.';
    }
    if (details.includes('subprocess-exited-with-error') || details.includes('Failed building wheel')) {
        return 'Package requires a native build step that failed in this runtime.'
            + ' Consider using a package with prebuilt wheels or extend the runtime image with build tools.';
    }
    if (isMissingBinaryError(details)) {
        return `No compatible binary wheels found for ${requirements.join(', ')} on this runtime.`;
    }
    return details.split('\n').slice(-6).join(' ');
}

export async function runPipInstall(args: string[]): Promise<{
    success: boolean;
    message?: string;
    details: string;
}> {
    try {
        const { stdout, stderr } = await execDocker(args, { timeout: 120000 });
        return { success: true, message: stdout || stderr, details: `${stdout}\n${stderr}` };
    } catch (error) {
        const err = error as { message?: string; stdout?: string; stderr?: string };
        const details = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n');
        return { success: false, details };
    }
}

export async function runPipInstallStream(
    args: string[],
    onEvent: (event: PackageInstallEvent) => void,
    attemptLabel: 'binary-attempt' | 'source-attempt'
): Promise<{
    success: boolean;
    message?: string;
    details: string;
}> {
    const progressMarkers = [
        { match: /Collecting/i, progress: 15, stage: 'Collecting' },
        { match: /Installing build dependencies/i, progress: 45, stage: 'Installing build dependencies' },
        { match: /Preparing metadata/i, progress: 55, stage: 'Preparing metadata' },
        { match: /Downloading/i, progress: 35, stage: 'Downloading' },
        { match: /Building wheels?/i, progress: 60, stage: 'Building wheels' },
        { match: /Installing collected packages/i, progress: 85, stage: 'Installing' },
        { match: /Requirement already satisfied/i, progress: 92, stage: 'Already satisfied' },
        { match: /Successfully built/i, progress: 95, stage: 'Built' },
        { match: /Successfully installed/i, progress: 100, stage: 'Completed' }
    ];

    return new Promise((resolve) => {
        const proc = spawn('docker', args);
        const outputLines: string[] = [];
        let currentProgress = 0;
        let settled = false;
        let timedOut = false;
        const installTimeout = setTimeout(() => {
            timedOut = true;
            onEvent({ type: 'log', message: INSTALL_TIMEOUT_MESSAGE });
            console.warn(`[containerManager] pip install timed out (${attemptLabel})`);
            proc.kill('SIGKILL');
        }, PIP_INSTALL_TIMEOUT_MS);

        const finish = (result: { success: boolean; message?: string; details: string }) => {
            if (settled) return;
            settled = true;
            clearTimeout(installTimeout);
            resolve(result);
        };

        const handleLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            outputLines.push(trimmed);
            onEvent({ type: 'log', message: trimmed });

            for (const marker of progressMarkers) {
                if (marker.match.test(trimmed) && marker.progress > currentProgress) {
                    currentProgress = marker.progress;
                    onEvent({ type: 'progress', progress: currentProgress, stage: marker.stage });
                    console.info(`[containerManager] pip install phase -> ${marker.stage} (${attemptLabel}, ${currentProgress}%)`);
                }
            }
        };

        const pump = (stream: NodeJS.ReadableStream) => {
            let buffer = '';
            stream.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? '';
                lines.forEach(handleLine);
            });
            stream.on('end', () => {
                if (buffer.trim()) {
                    handleLine(buffer);
                }
            });
        };

        pump(proc.stdout);
        pump(proc.stderr);

        proc.on('close', (code) => {
            const details = outputLines.join('\n');
            if (code === 0 && currentProgress < 100) {
                // pip can finish successfully without emitting a "Successfully installed"
                // line in some scenarios (already satisfied / quiet tails). Ensure the UI
                // always leaves the 85% plateau and proceeds to completion.
                const finalizingProgress = currentProgress < 95 ? 95 : 100;
                const finalizingStage = finalizingProgress === 100 ? 'Completed' : 'Finalizing';
                onEvent({ type: 'progress', progress: finalizingProgress, stage: finalizingStage });
                currentProgress = finalizingProgress;
                console.info(`[containerManager] pip install phase -> ${finalizingStage} (${attemptLabel}, ${finalizingProgress}%)`);
            }

            finish({
                success: code === 0,
                message: outputLines.slice(-2).join(' '),
                details: timedOut
                    ? `${details}\n${INSTALL_TIMEOUT_MESSAGE}`
                    : details
            });
        });
        proc.on('error', (error) => {
            finish({
                success: false,
                details: error instanceof Error ? error.message : 'Failed to start pip install process'
            });
        });
    });
}

/**
 * Install a package in a container
 */
export async function installPackage(
    container: Container,
    packageName: string
): Promise<{ success: boolean; message: string }> {
    const { requirements, aliasNotice } = normalizePackageInput(packageName);
    if (requirements.length === 0) {
        return { success: false, message: 'No valid package name provided.' };
    }

    try {
        const baseArgs = pipInstallBaseArgs(container.containerId);

        const binaryAttempt = await runPipInstall([
            ...baseArgs,
            '--only-binary',
            ':all:',
            ...requirements
        ]);

        if (binaryAttempt.success) {
            return {
                success: true,
                message: `${aliasNotice}${binaryAttempt.message || `Successfully installed ${requirements.join(', ')}`}`
            };
        }

        if (isMissingBinaryError(binaryAttempt.details)) {
            return {
                success: false,
                message: `${aliasNotice}No compatible binary wheels found for ${requirements.join(', ')} on this runtime.`
                    + ' Try another package or build a custom runtime image.'
            };
        }

        const sourceAttempt = await runPipInstall([
            ...baseArgs,
            ...requirements
        ]);

        if (sourceAttempt.success) {
            return {
                success: true,
                message: `${aliasNotice}${sourceAttempt.message || `Successfully installed ${requirements.join(', ')}`}`
            };
        }

        return {
            success: false,
            message: `${aliasNotice}${formatInstallError(sourceAttempt.details, requirements)}`
        };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to install package'
        };
    }
}

/**
 * Uninstall a package from a container
 */
export async function uninstallPackage(
    container: Container,
    packageName: string
): Promise<{ success: boolean; message: string }> {
    const trimmed = packageName.trim();
    if (!trimmed) {
        return { success: false, message: 'No package name provided.' };
    }

    try {
        const { stdout, stderr } = await execDocker([
            'exec',
            container.containerId,
            'python',
            '-m',
            'pip',
            'uninstall',
            '-y',
            '--target',
            CONTAINER_PYTHON_SITE_DIR,
            trimmed
        ], { timeout: 60000 });

        const output = (stdout + stderr).toLowerCase();
        if (output.includes('successfully uninstalled') || output.includes('not installed')) {
            return {
                success: true,
                message: output.includes('not installed')
                    ? `Package "${trimmed}" was not installed.`
                    : `Successfully uninstalled ${trimmed}`
            };
        }

        return { success: true, message: stdout || stderr || `Uninstalled ${trimmed}` };
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to uninstall package'
        };
    }
}

/**
 * List installed packages in a container
 */
export async function listPackages(container: Container): Promise<PackageInfo[]> {
    try {
        const script = [
            "import importlib.metadata as m",
            "import json",
            "packages = []",
            "for dist in m.distributions():",
            "    meta = dist.metadata",
            "    name = meta.get('Name') or dist.name",
            "    version = dist.version",
            "    summary = meta.get('Summary') or ''",
            "    homepage = meta.get('Home-page') or meta.get('Home-Page') or ''",
            "    packages.append({\"name\": name, \"version\": version, \"summary\": summary, \"homepage\": homepage})",
            "packages = sorted(packages, key=lambda p: (p.get('name') or '').lower())",
            "print(json.dumps(packages))"
        ].join('\n');
        const { stdout } = await execDocker([
            'exec',
            container.containerId,
            'python',
            '-c',
            script
        ]);

        const parsed = JSON.parse(stdout) as PackageInfo[];
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((pkg) => Boolean(pkg?.name));
    } catch {
        return [];
    }
}

/**
 * Install packages via streaming progress events
 */
export async function installPackageStream(
    container: Container,
    packageName: string,
    onEvent: (event: PackageInstallEvent) => void
): Promise<{ success: boolean; message: string }> {
    const { requirements, aliasNotice } = normalizePackageInput(packageName);
    if (requirements.length === 0) {
        return { success: false, message: 'No valid package name provided.' };
    }

    const baseArgs = pipInstallBaseArgs(container.containerId);

    onEvent({ type: 'progress', progress: 8, stage: 'Checking wheels' });
    console.info(`[containerManager] pip install phase -> checking-wheels (${requirements.join(', ')})`);

    const binaryAttempt = await runPipInstallStream(
        [...baseArgs, '--only-binary', ':all:', ...requirements],
        onEvent,
        'binary-attempt'
    );

    if (binaryAttempt.success) {
        onEvent({ type: 'progress', progress: 100, stage: 'Completed' });
        console.info(`[containerManager] pip install phase -> completed (binary-attempt, ${requirements.join(', ')})`);
        return {
            success: true,
            message: `${aliasNotice}Successfully installed ${requirements.join(', ')}`
        };
    }

    if (isMissingBinaryError(binaryAttempt.details)) {
        return {
            success: false,
            message: `${aliasNotice}No compatible binary wheels found for ${requirements.join(', ')} on this runtime.`
                + ' Try another package or build a custom runtime image.'
        };
    }

    if (isInstallTimeoutError(binaryAttempt.details)) {
        return {
            success: false,
            message: `${aliasNotice}Install timed out while resolving wheel dependencies.`
                + ' Please retry or try a lighter package spec.'
        };
    }

    onEvent({ type: 'progress', progress: 35, stage: 'Building from source' });
    console.info(`[containerManager] pip install phase -> building-from-source (${requirements.join(', ')})`);

    const sourceAttempt = await runPipInstallStream(
        [...baseArgs, ...requirements],
        onEvent,
        'source-attempt'
    );

    if (sourceAttempt.success) {
        onEvent({ type: 'progress', progress: 100, stage: 'Completed' });
        console.info(`[containerManager] pip install phase -> completed (source-attempt, ${requirements.join(', ')})`);
        return {
            success: true,
            message: `${aliasNotice}Successfully installed ${requirements.join(', ')}`
        };
    }

    return {
        success: false,
        message: `${aliasNotice}${formatInstallError(sourceAttempt.details, requirements)}`
    };
}

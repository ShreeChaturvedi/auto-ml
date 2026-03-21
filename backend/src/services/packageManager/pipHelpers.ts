/**
 * Pip Helpers
 *
 * Low-level utilities for running pip install/uninstall inside Docker containers,
 * including argument building, error classification, and streaming output parsing.
 */

import { spawn } from 'child_process';

import { appLogger } from '../../logging/logger.js';
import { execDocker } from '../dockerUtils.js';

import type { PackageInstallEvent } from './types.js';

const PACKAGE_ALIASES = new Map<string, string>([['pytorch', 'torch']]);

export const CONTAINER_PYTHON_SITE_DIR = '/workspace/.python';
export const PIP_INSTALL_TIMEOUT_MS = 8 * 60 * 1000;

/** Python preamble that ensures CONTAINER_PYTHON_SITE_DIR is on sys.path. */
export const SITE_DIR_PREAMBLE = [
    'import sys',
    `site = "${CONTAINER_PYTHON_SITE_DIR}"`,
    'if site not in sys.path:',
    '    sys.path.insert(0, site)',
];
const INSTALL_TIMEOUT_MESSAGE = 'Install timed out while waiting for pip process to finish.';

/** Build the common pip-install docker-exec argument prefix for a container. */
export function pipInstallBaseArgs(containerId: string): string[] {
    return [
        'exec', containerId,
        'python', '-m', 'pip', 'install',
        '--prefer-binary', '--no-cache-dir',
        '--target', CONTAINER_PYTHON_SITE_DIR,
    ];
}

export function isMissingBinaryError(details: string): boolean {
    return (
        details.includes('No matching distribution found') ||
        details.includes('Could not find a version that satisfies') ||
        details.includes('No compatible wheels')
    );
}

export function isInstallTimeoutError(details: string): boolean {
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
            appLogger.warn(`[containerManager] pip install timed out (${attemptLabel})`);
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

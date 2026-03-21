/**
 * Package Manager
 *
 * Handles pip package installation, uninstallation, and listing
 * within Docker containers used for sandboxed Python execution.
 */

import { appLogger } from '../logging/logger.js';
import type { PackageInfo } from '../types/execution.js';

import type { Container } from './containerManager.js';
import { execDocker } from './dockerUtils.js';
import {
    CONTAINER_PYTHON_SITE_DIR,
    SITE_DIR_PREAMBLE,
    formatInstallError,
    isMissingBinaryError,
    isInstallTimeoutError,
    normalizePackageInput,
    pipInstallBaseArgs,
    runPipInstall,
    runPipInstallStream,
} from './packageManager/pipHelpers.js';

export type { PackageInstallEvent } from './packageManager/types.js';

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
            '-e', `PYTHONPATH=${CONTAINER_PYTHON_SITE_DIR}`,
            container.containerId,
            'python',
            '-m',
            'pip',
            'uninstall',
            '-y',
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
            ...SITE_DIR_PREAMBLE,
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
    } catch (error) {
        appLogger.warn('[packageManager] Failed to list packages:', error);
        return [];
    }
}

/**
 * Install packages via streaming progress events
 */
export async function installPackageStream(
    container: Container,
    packageName: string,
    onEvent: (event: import('./packageManager/types.js').PackageInstallEvent) => void
): Promise<{ success: boolean; message: string }> {
    const { requirements, aliasNotice } = normalizePackageInput(packageName);
    if (requirements.length === 0) {
        return { success: false, message: 'No valid package name provided.' };
    }

    const baseArgs = pipInstallBaseArgs(container.containerId);

    onEvent({ type: 'progress', progress: 8, stage: 'Checking wheels' });
    appLogger.info(`[containerManager] pip install phase -> checking-wheels (${requirements.join(', ')})`);

    const binaryAttempt = await runPipInstallStream(
        [...baseArgs, '--only-binary', ':all:', ...requirements],
        onEvent,
        'binary-attempt'
    );

    if (binaryAttempt.success) {
        onEvent({ type: 'progress', progress: 100, stage: 'Completed' });
        appLogger.info(`[containerManager] pip install phase -> completed (binary-attempt, ${requirements.join(', ')})`);
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
    appLogger.info(`[containerManager] pip install phase -> building-from-source (${requirements.join(', ')})`);

    const sourceAttempt = await runPipInstallStream(
        [...baseArgs, ...requirements],
        onEvent,
        'source-attempt'
    );

    if (sourceAttempt.success) {
        onEvent({ type: 'progress', progress: 100, stage: 'Completed' });
        appLogger.info(`[containerManager] pip install phase -> completed (source-attempt, ${requirements.join(', ')})`);
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

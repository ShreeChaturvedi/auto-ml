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
    normalizePackageInput,
    pipInstallBaseArgs,
    pipInstallIndexArgs,
    runPipInstall,
    runPipInstallStream,
} from './packageManager/pipHelpers.js';

export type { PackageInstallEvent } from './packageManager/types.js';

async function ensureInstallTargetPopulated(container: Container): Promise<void> {
    const code = `
import glob
import os
import shutil

TARGET = "${CONTAINER_PYTHON_SITE_DIR}"

def visible_entries(path):
    return [p for p in glob.glob(os.path.join(path, "*")) if os.path.basename(p) != "__pycache__"]

def merge_entry(src, dest):
    if os.path.isdir(src):
        shutil.copytree(src, dest, dirs_exist_ok=True)
    else:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(src, dest)

if not visible_entries(TARGET):
    candidates = sorted(
        glob.glob("/workspace/.tmp/pip-target-*"),
        key=lambda p: os.path.getmtime(p) if os.path.exists(p) else 0,
        reverse=True,
    )
    for candidate in candidates:
        promoted = False

        python_roots = set(glob.glob(os.path.join(candidate, "lib", "python*")))
        python_roots.update(glob.glob(os.path.join(candidate, "lib", "python")))

        for python_root in sorted(python_roots):
            site_packages = os.path.join(python_root, "site-packages")
            source_root = site_packages if os.path.isdir(site_packages) else python_root
            for src in visible_entries(source_root):
                merge_entry(src, os.path.join(TARGET, os.path.basename(src)))
                promoted = True

        for extra_name in ("bin", "share"):
            extra_path = os.path.join(candidate, extra_name)
            if os.path.exists(extra_path):
                merge_entry(extra_path, os.path.join(TARGET, extra_name))
                promoted = True

        if promoted and visible_entries(TARGET):
            break

if not visible_entries(TARGET):
    raise RuntimeError("pip install completed without populating /workspace/.python")

print("Install target ready")
`.trim();

    await execDocker(
        ['exec', container.containerId, 'python', '-c', code],
        { timeout: 60_000 }
    );
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
        const indexArgs = pipInstallIndexArgs(requirements);
        const installAttempt = await runPipInstall([
            ...baseArgs,
            ...indexArgs,
            ...requirements
        ]);

        if (installAttempt.success) {
            await ensureInstallTargetPopulated(container);
            return {
                success: true,
                message: `${aliasNotice}${installAttempt.message || `Successfully installed ${requirements.join(', ')}`}`
            };
        }

        return {
            success: false,
            message: `${aliasNotice}${formatInstallError(installAttempt.details, requirements)}`
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
    const indexArgs = pipInstallIndexArgs(requirements);

    onEvent({ type: 'progress', progress: 8, stage: 'Installing package' });
    appLogger.info(`[containerManager] pip install phase -> install-start (${requirements.join(', ')})`);

    const installAttempt = await runPipInstallStream(
        [...baseArgs, ...indexArgs, ...requirements],
        onEvent,
        'source-attempt'
    );

    if (installAttempt.success) {
        await ensureInstallTargetPopulated(container);
        onEvent({ type: 'progress', progress: 100, stage: 'Completed' });
        appLogger.info(`[containerManager] pip install phase -> completed (${requirements.join(', ')})`);
        return {
            success: true,
            message: `${aliasNotice}Successfully installed ${requirements.join(', ')}`
        };
    }

    return {
        success: false,
        message: `${aliasNotice}${formatInstallError(installAttempt.details, requirements)}`
    };
}

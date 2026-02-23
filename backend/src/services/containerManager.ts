/**
 * Container Manager
 * 
 * Manages Docker containers for sandboxed Python code execution.
 * Provides container pooling, lifecycle management, and resource limits.
 */

import { spawn, exec, execFile, type ExecFileOptions } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile, rm } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config.js';
import type { PythonVersion, ExecutionResult, RichOutput, PackageInfo } from '../types/execution.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const PACKAGE_ALIASES = new Map<string, string>([['pytorch', 'torch']]);

async function execDocker(
    args: string[],
    options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync('docker', args, {
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
        ...options
    });
    return {
        stdout: typeof result.stdout === 'string' ? result.stdout : result.stdout.toString('utf8'),
        stderr: typeof result.stderr === 'string' ? result.stderr : result.stderr.toString('utf8')
    };
}
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
    const workspacePath = config.workspacePath;

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

    // Resolve to absolute paths (Docker requires absolute paths)
    const absWorkspacePath = resolve(workspacePath);
    const absDatasetsPath = resolve(env.datasetStorageDir);

    const dockerArgs = [
        'run',
        '-d', // detached
        '--name', containerName,
        '--memory', `${env.executionMaxMemoryMb}m`,
        '--cpus', `${env.executionMaxCpuPercent / 100}`,
        '--network', env.executionNetwork, // network policy
        '--read-only', // read-only root fs
        '--tmpfs', `/tmp:rw,nosuid,size=${env.executionTmpfsMb}m`, // writable tmp
        '-v', `${absWorkspacePath}:/workspace:rw`, // mount workspace
        '-v', `${absDatasetsPath}:/datasets:ro`, // mount datasets read-only
        '-w', '/workspace',
        '--user', 'sandbox',
        '-e', 'HOME=/workspace',
        '-e', 'PYTHONPATH=/workspace/.python',
        '-e', 'PIP_CACHE_DIR=/workspace/.cache/pip',
        '-e', 'PIP_DISABLE_PIP_VERSION_CHECK=1',
        '-e', 'TMPDIR=/workspace/.tmp',
        ...(env.executionDockerPlatform ? ['--platform', env.executionDockerPlatform] : []),
        imageName,
        'tail', '-f', '/dev/null' // keep container running
    ];

    try {
        const { stdout } = await execDocker(dockerArgs);
        const containerId = stdout.trim();

        const container: Container = {
            id,
            containerId,
            projectId: config.projectId,
            pythonVersion: config.pythonVersion,
            workspacePath,
            createdAt: new Date(),
            lastUsedAt: new Date()
        };

        containers.set(id, container);
        console.log(`[containerManager] Created container ${containerName} (${containerId.slice(0, 12)})`);

        return container;
    } catch (error) {
        // Clean up workspace on failure
        await rm(workspacePath, { recursive: true, force: true }).catch(() => { });
        throw new Error(`Failed to create container: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Execute code in a container
 */
export async function executeInContainer(
    container: Container,
    code: string,
    timeoutMs: number = env.executionTimeoutMs,
    options: { executionId?: string } = {}
): Promise<ExecutionResult> {
    const startTime = Date.now();
    const safeId = options.executionId
        ? options.executionId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
        : '';
    const suffix = safeId ? `_${safeId}` : '';

    // Write code to a temporary file in the workspace
    const codePath = join(container.workspacePath, `_exec_code${suffix}.py`);
    const outputFilename = `_outputs${suffix}.json`;

    // Wrap code with output capturing
    const wrappedCode = `
import sys
import json
import traceback
from pathlib import Path

# Capture outputs
_outputs = []

# Override print to capture output
_original_print = print
def print(*args, **kwargs):
    import io
    output = io.StringIO()
    _original_print(*args, file=output, **kwargs)
    value = output.getvalue()
    _outputs.append({"type": "text", "content": value})
    _original_print(*args, **kwargs)

# Helper to display dataframes nicely
def _display_df(df, max_rows=20):
    """Display DataFrame as table output"""
    if hasattr(df, 'to_dict'):
        data = df.head(max_rows).to_dict('records')
        cols = list(df.columns)
        _outputs.append({
            "type": "table",
            "content": f"DataFrame ({len(df)} rows, {len(cols)} cols)",
            "data": {"columns": cols, "rows": data}
        })

# Make datasets accessible + user packages visible
import os
os.chdir('/workspace')
if '/workspace/.python' not in sys.path:
    sys.path.insert(0, '/workspace/.python')

def resolve_dataset_path(filename, dataset_id=None):
    """Resolve dataset path across cloud and browser mounts.

    Checks multiple locations in order of priority:
    1. Direct filename in workspace root (/workspace/{filename})
    2. Workspace datasets dir (/workspace/datasets/{filename})
    3. Mounted datasets dir (/datasets/{filename})
    4. UUID-based paths if dataset_id provided
    5. Fallback to recursive search
    """
    candidates = []

    # First priority: direct filename access (workspace root and datasets dir)
    candidates.extend([
        Path('/workspace') / filename,
        Path('/workspace/datasets') / filename,
        Path('/datasets') / filename
    ])

    # UUID-based paths if dataset_id is provided
    if dataset_id:
        candidates.extend([
            Path('/workspace/datasets') / dataset_id / filename,
            Path('/datasets') / dataset_id / filename
        ])

        # Alias pattern with suffix
        suffix = ''.join([c for c in str(dataset_id) if c.isalnum()])[:8]
        if suffix:
            stem = Path(filename).stem
            ext = Path(filename).suffix
            alias = f"{stem}__{suffix}{ext}"
            candidates.extend([
                Path('/workspace/datasets') / alias,
                Path('/datasets') / alias
            ])

    # Check all candidates
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    # Fallback: recursive search
    for root in [Path('/workspace'), Path('/workspace/datasets'), Path('/datasets')]:
        if root.exists():
            matches = list(root.rglob(filename))
            if matches:
                return str(matches[0])

    # Return first candidate as fallback (will fail with clear error)
    return str(candidates[0])

try:
${code.split('\n').map(line => '    ' + line).join('\n')}
except Exception as e:
    _outputs.append({
        "type": "error",
        "content": traceback.format_exc()
    })

# Write outputs to file
with open('/workspace/${outputFilename}', 'w') as f:
    json.dump(_outputs, f)
`;

    await writeFile(codePath, wrappedCode);

    // Execute in container
    const execPath = `/workspace/_exec_code${suffix}.py`;
    const dockerExec = spawn('docker', [
        'exec',
        container.containerId,
        'python',
        execPath
    ]);

    let stdout = '';
    let stderr = '';

    dockerExec.stdout.on('data', (data) => {
        stdout += data.toString();
    });

    dockerExec.stderr.on('data', (data) => {
        stderr += data.toString();
    });

    // Handle timeout
    const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
        setTimeout(() => {
            dockerExec.kill();
            reject(new Error('Execution timeout'));
        }, timeoutMs);
    });

    const executionPromise = new Promise<ExecutionResult>((resolve) => {
        dockerExec.on('close', async (exitCode) => {
            const executionMs = Date.now() - startTime;

            // Try to read captured outputs
            let outputs: RichOutput[] = [];
            try {
                const { stdout: outputJson } = await execDocker([
                    'exec',
                    container.containerId,
                    'cat',
                    `/workspace/${outputFilename}`
                ]);
                outputs = JSON.parse(outputJson);
            } catch {
                // If no outputs file, use stdout as text output
                if (stdout.trim()) {
                    outputs.push({ type: 'text', content: stdout });
                }
            }

            // Clean up temp files
            await execDocker([
                'exec',
                container.containerId,
                'rm',
                '-f',
                execPath,
                `/workspace/${outputFilename}`
            ]).catch(() => { });

            container.lastUsedAt = new Date();

            const hasErrorOutput = outputs.some((output) => output.type === 'error');

            if (exitCode !== 0 && stderr) {
                outputs.push({ type: 'error', content: stderr });
            }

            resolve({
                status: exitCode === 0 && !hasErrorOutput ? 'success' : 'error',
                stdout,
                stderr: hasErrorOutput && !stderr
                    ? outputs.find((output) => output.type === 'error')?.content ?? ''
                    : stderr,
                outputs,
                executionMs,
                error: exitCode !== 0 || hasErrorOutput ? (stderr || outputs.find((output) => output.type === 'error')?.content) : undefined
            });
        });
    });

    try {
        return await Promise.race([executionPromise, timeoutPromise]);
    } catch {
        return {
            status: 'timeout',
            stdout,
            stderr,
            outputs: [{ type: 'error', content: 'Execution timed out' }],
            executionMs: timeoutMs,
            error: 'Execution timed out'
        };
    }
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
        const baseArgs = [
            'exec',
            container.containerId,
            'python',
            '-m',
            'pip',
            'install',
            '--prefer-binary',
            '--no-cache-dir',
            '--target',
            '/workspace/.python'
        ];

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
            '/workspace/.python',
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

export type PackageInstallEvent = {
    type: 'progress' | 'log';
    progress?: number;
    stage?: string;
    message?: string;
};

export async function installPackageStream(
    container: Container,
    packageName: string,
    onEvent: (event: PackageInstallEvent) => void
): Promise<{ success: boolean; message: string }> {
    const { requirements, aliasNotice } = normalizePackageInput(packageName);
    if (requirements.length === 0) {
        return { success: false, message: 'No valid package name provided.' };
    }

    const baseArgs = [
        'exec',
        container.containerId,
        'python',
        '-m',
        'pip',
        'install',
        '--prefer-binary',
        '--no-cache-dir',
        '--target',
        '/workspace/.python'
    ];

    onEvent({ type: 'progress', progress: 8, stage: 'Checking wheels' });

    const binaryAttempt = await runPipInstallStream(
        [...baseArgs, '--only-binary', ':all:', ...requirements],
        onEvent
    );

    if (binaryAttempt.success) {
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

    onEvent({ type: 'progress', progress: 35, stage: 'Building from source' });

    const sourceAttempt = await runPipInstallStream([...baseArgs, ...requirements], onEvent);

    if (sourceAttempt.success) {
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

async function runPipInstall(args: string[]): Promise<{
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

async function runPipInstallStream(
    args: string[],
    onEvent: (event: PackageInstallEvent) => void
): Promise<{
    success: boolean;
    message?: string;
    details: string;
}> {
    const progressMarkers = [
        { match: /Collecting/i, progress: 15, stage: 'Collecting' },
        { match: /Downloading/i, progress: 35, stage: 'Downloading' },
        { match: /Building wheels?/i, progress: 60, stage: 'Building wheels' },
        { match: /Installing collected packages/i, progress: 85, stage: 'Installing' },
        { match: /Successfully installed/i, progress: 100, stage: 'Completed' }
    ];

    return new Promise((resolve) => {
        const proc = spawn('docker', args);
        const outputLines: string[] = [];
        let currentProgress = 0;

        const handleLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            outputLines.push(trimmed);
            onEvent({ type: 'log', message: trimmed });

            for (const marker of progressMarkers) {
                if (marker.match.test(trimmed) && marker.progress > currentProgress) {
                    currentProgress = marker.progress;
                    onEvent({ type: 'progress', progress: currentProgress, stage: marker.stage });
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
            resolve({
                success: code === 0,
                message: outputLines.slice(-2).join(' '),
                details
            });
        });
        proc.on('error', (error) => {
            resolve({
                success: false,
                details: error instanceof Error ? error.message : 'Failed to start pip install process'
            });
        });
    });
}

function isMissingBinaryError(details: string): boolean {
    return (
        details.includes('No matching distribution found') ||
        details.includes('Could not find a version that satisfies') ||
        details.includes('No compatible wheels')
    );
}

function formatInstallError(details: string, requirements: string[]): string {
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
    if (details.includes('subprocess-exited-with-error') || details.includes('Failed building wheel')) {
        return 'Package requires a native build step that failed in this runtime.'
            + ' Consider using a package with prebuilt wheels or extend the runtime image with build tools.';
    }
    if (isMissingBinaryError(details)) {
        return `No compatible binary wheels found for ${requirements.join(', ')} on this runtime.`;
    }
    return details.split('\n').slice(-6).join(' ');
}

function normalizePackageInput(input: string): { requirements: string[]; aliasNotice: string } {
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

/**
 * Destroy a container and clean up resources
 */
export async function destroyContainer(containerId: string): Promise<void> {
    const container = containers.get(containerId);
    if (!container) return;

    try {
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
export async function cleanupStaleContainers(): Promise<void> {
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
    jediInstalledContainers.clear();

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

/**
 * Python completion result
 */
export interface PythonCompletion {
    name: string;
    type: 'function' | 'class' | 'module' | 'variable' | 'keyword' | 'statement' | 'param' | 'property';
    module?: string;
    signature?: string;
    docstring?: string;
}

/**
 * Get Python completions using Jedi
 */
export async function getCompletions(
    container: Container,
    code: string,
    line: number,
    column: number
): Promise<PythonCompletion[]> {
    try {
        // First ensure jedi is installed
        await ensureJediInstalled(container);

        // Create a script that gets completions using Jedi
        const script = `
import sys
import json

# Ensure jedi is available
try:
    import jedi
except ImportError:
    print("[]")
    sys.exit(0)

code = '''${code.replace(/'/g, "\\'")}'''

try:
    script = jedi.Script(code)
    completions = script.complete(${line}, ${column})

    results = []
    for c in completions[:50]:  # Limit to 50 completions
        comp = {
            "name": c.name,
            "type": c.type or "statement"
        }
        if c.module_name:
            comp["module"] = c.module_name

        # Get signature for functions
        try:
            sigs = c.get_signatures()
            if sigs:
                comp["signature"] = str(sigs[0])
        except:
            pass

        # Get docstring (truncated)
        try:
            doc = c.docstring()
            if doc:
                comp["docstring"] = doc[:200]
        except:
            pass

        results.append(comp)

    print(json.dumps(results))
except Exception as e:
    print(json.dumps([]))
`;

        const { stdout } = await execDocker([
            'exec',
            container.containerId,
            'python',
            '-c',
            script
        ], { timeout: 5000 });

        try {
            const completions = JSON.parse(stdout.trim()) as PythonCompletion[];
            return completions;
        } catch {
            return [];
        }
    } catch {
        return [];
    }
}

// Track jedi installation status per container
const jediInstalledContainers = new Set<string>();

async function ensureJediInstalled(container: Container): Promise<void> {
    if (jediInstalledContainers.has(container.containerId)) {
        return;
    }

    // Check if jedi is installed
    try {
        await execDocker([
            'exec',
            container.containerId,
            'python',
            '-c',
            'import jedi'
        ], { timeout: 3000 });
        jediInstalledContainers.add(container.containerId);
        return;
    } catch {
        // Jedi not installed, install it
    }

    try {
        await execDocker([
            'exec',
            container.containerId,
            'python',
            '-m',
            'pip',
            'install',
            '--quiet',
            '--target',
            '/workspace/.python',
            'jedi'
        ], { timeout: 60000 });
        jediInstalledContainers.add(container.containerId);
    } catch (error) {
        console.warn('[containerManager] Failed to install jedi:', error);
    }
}

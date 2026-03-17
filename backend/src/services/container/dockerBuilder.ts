/**
 * Container Manager — Docker Builder
 *
 * Builds the `docker run` argument list for creating a sandboxed Python
 * execution container with security constraints, resource limits, and
 * bind-mounted workspace/dataset directories.
 */

import { resolve } from 'path';

import { env } from '../../config.js';
import { CONTAINER_PYTHON_SITE_DIR } from '../packageManager/pipHelpers.js';

const CONTAINER_WORKSPACE_ROOT = '/workspace';
const CONTAINER_PIP_CACHE_DIR = `${CONTAINER_WORKSPACE_ROOT}/.cache/pip`;
const CONTAINER_TMP_DIR = `${CONTAINER_WORKSPACE_ROOT}/.tmp`;

/**
 * Build the full `docker run` argument array for launching a container.
 */
export function buildDockerRunArgs(params: {
    containerName: string;
    imageName: string;
    workspacePath: string;
}): string[] {
    const { containerName, imageName, workspacePath } = params;

    // Docker requires absolute host paths for bind mounts.
    const absWorkspacePath = workspacePath;
    const absDatasetsPath = resolve(env.datasetStorageDir);

    return [
        'run',
        '-d', // detached
        '--name', containerName,
        '--memory', `${env.executionMaxMemoryMb}m`,
        '--cpus', `${env.executionMaxCpuPercent / 100}`,
        '--network', env.executionNetwork, // network policy
        '--read-only', // read-only root fs
        '--tmpfs', `/tmp:rw,nosuid,size=${env.executionTmpfsMb}m,mode=1777`, // writable tmp
        '--tmpfs', '/home/sandbox/.local:rw,nosuid,size=100m,mode=1777',
        '--tmpfs', '/home/sandbox/.jupyter:rw,nosuid,size=10m,mode=1777',
        '--tmpfs', '/home/sandbox/.ipython:rw,nosuid,size=10m,mode=1777',
        '--tmpfs', '/run/user:rw,nosuid,size=10m,mode=1777',
        '-v', `${absWorkspacePath}:/workspace:rw`, // mount workspace
        '-v', `${absDatasetsPath}:/datasets:ro`, // mount datasets read-only
        '-w', CONTAINER_WORKSPACE_ROOT,
        '--user', 'sandbox',
        '-e', `HOME=${CONTAINER_WORKSPACE_ROOT}`,
        '-e', `PYTHONPATH=${CONTAINER_PYTHON_SITE_DIR}`,
        '-e', `PIP_CACHE_DIR=${CONTAINER_PIP_CACHE_DIR}`,
        '-e', 'PIP_DISABLE_PIP_VERSION_CHECK=1',
        '-e', `TMPDIR=${CONTAINER_TMP_DIR}`,
        '-e', 'MPLCONFIGDIR=/tmp/matplotlib',
        ...(env.executionDockerPlatform ? ['--platform', env.executionDockerPlatform] : []),
        '-p', '0:8888',
        imageName
    ];
}

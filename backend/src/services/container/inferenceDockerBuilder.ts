import { resolve } from 'path';

import { env } from '../../config.js';
import { CONTAINER_PYTHON_SITE_DIR, pipInstallIndexArgs } from '../packageManager/pipHelpers.js';

/**
 * Build docker run args for an inference (FastAPI) container.
 *
 * Key differences from kernel gateway containers:
 * - Port: 8000 (not 8888)
 * - Entrypoint: python /workspace/serve.py (not kernel gateway), OR
 *   when runtimeDependencies are present, a sh wrapper that pip-installs
 *   into /workspace/.python first, then execs serve.py.
 * - Name prefix: automl-serve- (not automl-exec-) — critical to avoid orphan killer in containerCleanup.ts
 * - Bind mounts: model artifact dir at /model:ro, deployment dir at /workspace:rw
 * - No Jupyter-specific tmpfs
 *
 * Runtime-dependency installation (issue #323):
 *   Base runtime image (Dockerfile.python-runtime) ships only
 *   sklearn/pandas/numpy/scipy/matplotlib/shap/optuna. Models pickled with
 *   xgboost/catboost/lightgbm/pytorch-tabular need their libraries installed
 *   at container boot — same pattern as the kernel-gateway path
 *   (containerOrchestrator.ts → installPackage), but via `sh -c` because the
 *   inference container has no long-running process to docker-exec into; if
 *   serve.py's import fails, PID 1 exits and the container dies.
 *   pip --target writes into /workspace/.python (CONTAINER_PYTHON_SITE_DIR,
 *   inside the rw bind mount); PYTHONPATH is prepended so serve.py finds the
 *   installed wheels.
 */
export function buildInferenceDockerRunArgs(params: {
  containerName: string;
  imageName: string;
  modelArtifactPath: string; // host path to model dir (e.g., storage/models/artifacts/<modelId>)
  deploymentDir: string;     // host path to deployment dir (e.g., storage/deployments/<deploymentId>)
  runtimeDependencies?: string[]; // pip requirements to install at boot (e.g., ['xgboost'])
}): string[] {
  const {
    containerName,
    imageName,
    modelArtifactPath,
    deploymentDir,
    runtimeDependencies = [],
  } = params;

  const absModelPath = resolve(modelArtifactPath);
  const absDeploymentDir = resolve(deploymentDir);

  const baseArgs = [
    'run',
    '-d',
    '--name', containerName,
    '--memory', `${env.executionMaxMemoryMb}m`,
    '--cpus', `${env.executionMaxCpuPercent / 100}`,
    '--network', env.executionNetwork,
    '--add-host', 'host.docker.internal:0.0.0.0',
    '--read-only',
    '--tmpfs', `/tmp:rw,nosuid,size=${env.executionTmpfsMb}m,mode=1777`,
    '--tmpfs', '/home/sandbox/.local:rw,nosuid,size=100m,mode=1777',
    '--tmpfs', '/run/user:rw,nosuid,size=10m,mode=1777',
    '-v', `${absModelPath}:/model:ro`,         // model artifacts read-only
    '-v', `${absDeploymentDir}:/workspace:rw`, // serve.py lives here
    '-w', '/workspace',
    '--user', 'sandbox',
    '-e', 'HOME=/workspace',
    '-e', 'MPLCONFIGDIR=/tmp/matplotlib',
    '-e', `PYTHONPATH=${CONTAINER_PYTHON_SITE_DIR}`,
    ...(env.executionDockerPlatform ? ['--platform', env.executionDockerPlatform] : []),
    '-p', '0:8000', // ephemeral host port → container 8000
  ];

  if (runtimeDependencies.length === 0) {
    return [
      ...baseArgs,
      '--entrypoint', 'python',
      imageName,
      '/workspace/serve.py',
    ];
  }

  // Build a single sh command that (a) pip-installs into the rw bind mount
  // with --no-cache-dir + --target, respecting the pytorch CPU wheel index
  // for torch/pytorch-tabular/etc., then (b) execs serve.py so PID 1 is the
  // FastAPI process (kept for docker stop + readiness semantics).
  const indexArgs = pipInstallIndexArgs(runtimeDependencies);
  const pipCmd = [
    'python', '-m', 'pip', 'install',
    '--prefer-binary',
    '--no-cache-dir',
    '--target', CONTAINER_PYTHON_SITE_DIR,
    ...indexArgs,
    ...runtimeDependencies,
  ].map(shQuote).join(' ');

  const bootstrap = `${pipCmd} && exec python /workspace/serve.py`;

  return [
    ...baseArgs,
    '--entrypoint', 'sh',
    imageName,
    '-c', bootstrap,
  ];
}

/** POSIX-sh safe-quote a single argument. */
function shQuote(arg: string): string {
  if (arg === '' || /[^\w.@%+=:,/-]/.test(arg)) {
    return `'${arg.replace(/'/g, `'\\''`)}'`;
  }
  return arg;
}

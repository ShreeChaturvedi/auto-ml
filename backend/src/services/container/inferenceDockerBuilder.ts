import { resolve } from 'path';

import { env } from '../../config.js';

/**
 * Build docker run args for an inference (FastAPI) container.
 *
 * Key differences from kernel gateway containers:
 * - Port: 8000 (not 8888)
 * - Entrypoint: python /workspace/serve.py (not kernel gateway)
 * - Name prefix: automl-serve- (not automl-exec-) — critical to avoid orphan killer in containerCleanup.ts
 * - Bind mounts: model artifact dir at /model:ro, deployment dir at /workspace:rw
 * - No Jupyter-specific tmpfs
 */
export function buildInferenceDockerRunArgs(params: {
  containerName: string;
  imageName: string;
  modelArtifactPath: string; // host path to model dir (e.g., storage/models/artifacts/<modelId>)
  deploymentDir: string;     // host path to deployment dir (e.g., storage/deployments/<deploymentId>)
}): string[] {
  const { containerName, imageName, modelArtifactPath, deploymentDir } = params;

  const absModelPath = resolve(modelArtifactPath);
  const absDeploymentDir = resolve(deploymentDir);

  return [
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
    ...(env.executionDockerPlatform ? ['--platform', env.executionDockerPlatform] : []),
    '-p', '0:8000', // ephemeral host port → container 8000
    '--entrypoint', 'python',
    imageName,
    '/workspace/serve.py', // CMD arg
  ];
}

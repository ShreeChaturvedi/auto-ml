import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { getOrCreateContainer } from '../services/containerManager.js';
import { syncWorkspaceDatasets } from '../services/executionWorkspace.js';
import * as kernelManager from '../services/kernelManager.js';
import { installPackage, listPackages } from '../services/packageManager.js';
import { normalizeRuntimeDependencies } from '../services/runtimeDependencies.js';

/**
 * Configuration for orchestrating container execution.
 */
export interface ContainerOrchestrationConfig {
  projectId: string;
  pythonVersion: string;
  scriptBuilder: () => string;
  filesToCopy: Array<{
    permanentPath: string;
    workspacePath: string;
  }>;
  packagesToInstall?: string[];
  timeoutMs: number;
  containerOutputDir: string;
  onOutput?: (output: RichOutput) => void;
}

/**
 * Result from orchestrating container execution.
 */
export interface OrchestrationResult {
  container: {
    workspacePath: string;
    containerId?: string;
  };
  executionResult: {
    status: 'success' | 'error' | 'timeout';
    stderr?: string;
    error?: string;
    executionMs?: number;
  };
}

/**
 * A rich output object from kernel execution.
 */
export interface RichOutput {
  type: string;
  content: string;
}

/**
 * Orchestrate a container execution following the standard 6-step pattern:
 * 1. Get or create container
 * 2. Sync workspace datasets
 * 3. Copy input files
 * 4. Build and execute Python script
 * 5. Return execution result
 * 6. (Caller handles artifacts)
 */
export async function orchestrateContainerExecution(
  config: ContainerOrchestrationConfig,
): Promise<OrchestrationResult> {
  // Step 1: Get or create container
  const container = await getOrCreateContainer({
    projectId: config.projectId,
    pythonVersion: config.pythonVersion as '3.10' | '3.11',
    workspacePath: join(process.env.EXECUTION_WORKSPACE_DIR || '/tmp/workspace', config.projectId, 'model-runtime'),
  });

  // Step 2: Sync workspace datasets (best-effort)
  if (container.workspacePath) {
    await syncWorkspaceDatasets(config.projectId, container.workspacePath).catch(() => {
      // Ignore sync errors — datasets may already be present
    });
  }

  const runtimeDependencies = normalizeRuntimeDependencies(config.packagesToInstall);
  if (runtimeDependencies.length > 0) {
    const installedPackages = await listPackages(container);
    const installedNames = new Set(
      installedPackages
        .map((pkg) => pkg.name?.trim().toLowerCase().replace(/_/g, '-'))
        .filter((name): name is string => Boolean(name))
    );

    for (const requirement of runtimeDependencies) {
      const packageBase = requirement.match(/^[a-z0-9][a-z0-9.-]*/)?.[0] ?? requirement;
      if (installedNames.has(packageBase)) {
        continue;
      }
      const installResult = await installPackage(container, requirement);
      if (!installResult.success) {
        throw new Error(`Failed to install runtime dependency "${requirement}": ${installResult.message}`);
      }
      installedNames.add(packageBase);
    }
  }

  // Step 3: Copy input files
  for (const file of config.filesToCopy) {
    if (isAbsolute(file.workspacePath)) {
      throw new Error(`workspacePath must be relative to the container workspace, received absolute path: ${file.workspacePath}`);
    }
    const workspaceDir = join(container.workspacePath, file.workspacePath, '..');
    const destinationPath = join(container.workspacePath, file.workspacePath);
    await mkdir(workspaceDir, { recursive: true });
    await copyFile(file.permanentPath, destinationPath);
  }

  // Step 4: Build and execute script
  const script = config.scriptBuilder();
  const executionResult = await kernelManager.execute(container, script, config.timeoutMs, config.onOutput);

  // Step 5: Return combined result
  return {
    container,
    executionResult: {
      status: executionResult.status as 'success' | 'error' | 'timeout',
      stderr: executionResult.stderr,
      error: executionResult.error,
      executionMs: executionResult.executionMs,
    },
  };
}

/**
 * Configuration for copying artifacts from container workspace to permanent storage.
 */
export interface ArtifactCopyConfig {
  workspace: string; // Path relative to container.workspacePath (e.g., "eval/model-123/predictions.parquet")
  permanent: string; // Filename in permanent storage (e.g., "predictions.parquet")
  optional?: boolean; // If true, don't error if file doesn't exist
}

/**
 * Copy artifacts from container workspace to permanent storage.
 */
export async function copyArtifactsToPermanentStorage(
  modelId: string,
  container: { workspacePath: string },
  artifacts: ArtifactCopyConfig[],
): Promise<void> {
  const storageDir = join(process.env.MODEL_STORAGE_DIR || '/tmp/models', modelId);
  await mkdir(storageDir, { recursive: true });

  for (const artifact of artifacts) {
    const workspacePath = join(container.workspacePath, artifact.workspace);
    const storagePath = join(storageDir, artifact.permanent);

    try {
      // Ensure parent directory exists
      const storageParentDir = join(storagePath, '..');
      await mkdir(storageParentDir, { recursive: true });
      await copyFile(workspacePath, storagePath);
    } catch (err) {
      if (!artifact.optional) {
        throw err;
      }
      // Silently skip optional artifacts that don't exist
    }
  }
}

/**
 * Load an artifact from permanent storage.
 */
export async function loadArtifactFromStorage(
  modelId: string,
  filename: string,
): Promise<unknown> {
  const storagePath = join(process.env.MODEL_STORAGE_DIR || '/tmp/models', modelId, filename);
  const raw = await readFile(storagePath, 'utf8');
  return JSON.parse(raw);
}

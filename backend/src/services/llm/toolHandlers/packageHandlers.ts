/**
 * Package Management Tool Handlers - implementations for package-related tool calls
 */

import { appLogger } from '../../../logging/logger.js';
import type { ToolCall } from '../../../types/llm.js';
import { execDocker } from '../../dockerUtils.js';
import { refreshKernelPythonPath, restartKernel, shutdownKernel, verifyKernelImports } from '../../kernelManager.js';
import { getOrEnsureContainer } from '../../notebook/cellExecutionService.js';
import { installPackage, listPackages, uninstallPackage } from '../../packageManager.js';
import { getCandidateImportNamesForRequirement, normalizeRuntimeDependencies } from '../../runtimeDependencies.js';

const DEFAULT_IMPORT_VERIFICATION_TIMEOUT_MS = 20_000;
const HEAVY_IMPORT_VERIFICATION_TIMEOUT_MS = 60_000;
const HEAVY_IMPORT_MODULES = new Set(['torch', 'tensorflow']);

function buildImportVerificationPlan(packageName: string): string[][] {
  const requirements = normalizeRuntimeDependencies(packageName.split(/[,\s]+/));
  return requirements
    .map((requirement) => getCandidateImportNamesForRequirement(requirement))
    .filter((candidates) => candidates.length > 0);
}

function getImportVerificationTimeoutMs(importCandidatesByRequirement: string[][]): number {
  const hasHeavyModule = importCandidatesByRequirement.some((candidates) =>
    candidates.some((candidate) => HEAVY_IMPORT_MODULES.has(candidate.toLowerCase())),
  );
  return hasHeavyModule ? HEAVY_IMPORT_VERIFICATION_TIMEOUT_MS : DEFAULT_IMPORT_VERIFICATION_TIMEOUT_MS;
}

async function verifyContainerImports(
  container: Awaited<ReturnType<typeof getOrEnsureContainer>>,
  importCandidatesByRequirement: string[][],
  timeoutMs: number,
): Promise<void> {
  const candidateJson = JSON.stringify(importCandidatesByRequirement);
  const code = [
    'import importlib',
    'import json',
    'import site',
    'import sys',
    'site.addsitedir("/workspace/.python")',
    'if "/workspace/.python" not in sys.path:',
    '    sys.path.insert(0, "/workspace/.python")',
    `candidates_by_requirement = json.loads(${JSON.stringify(candidateJson)})`,
    'for candidates in candidates_by_requirement:',
    '    verified = False',
    '    for module_name in candidates:',
    '        try:',
    '            importlib.import_module(module_name)',
    '            verified = True',
    '            break',
    '        except Exception:',
    '            pass',
    '    if not verified:',
    '        raise RuntimeError(f"Unable to import any of: {candidates}")',
    'print("Container import verification passed")',
  ].join('\n');

  await execDocker(
    ['exec', container.containerId, 'python', '-c', code],
    { timeout: timeoutMs },
  );
}

async function ensureKernelSeesInstalledPackages(
  projectId: string,
  container: Awaited<ReturnType<typeof getOrEnsureContainer>>,
  packageName: string,
): Promise<void> {
  const importCandidatesByRequirement = buildImportVerificationPlan(packageName);
  if (importCandidatesByRequirement.length === 0) {
    return;
  }
  const importVerificationTimeoutMs = getImportVerificationTimeoutMs(importCandidatesByRequirement);

  await refreshKernelPythonPath(container).catch((error) => {
    appLogger.warn('[packageHandlers] Failed to refresh kernel package cache after install', {
      projectId,
      packageName,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const verifyImports = async () => {
    for (const candidates of importCandidatesByRequirement) {
      let verified = false;
      for (const moduleName of candidates) {
        try {
          await verifyKernelImports(container, [moduleName], importVerificationTimeoutMs);
          verified = true;
          break;
        } catch {
          // Try the next import alias for this requirement.
        }
      }
      if (!verified) {
        throw new Error(
          `Installed package could not be imported in the live kernel (${candidates.join(' or ')}).`,
        );
      }
    }
  };

  try {
    await verifyImports();
  } catch (error) {
    await restartKernel(container);
    try {
      await verifyImports();
      return;
    } catch {
      try {
        await verifyContainerImports(container, importCandidatesByRequirement, importVerificationTimeoutMs);
        await shutdownKernel(container).catch((shutdownError) => {
          appLogger.warn('[packageHandlers] Installed package verified out-of-band but kernel shutdown failed', {
            projectId,
            packageName,
            error: shutdownError instanceof Error ? shutdownError.message : String(shutdownError),
          });
        });
        appLogger.warn('[packageHandlers] Installed package verified via container import after live-kernel verification failed', {
          projectId,
          packageName,
        });
        return;
      } catch {
        throw error;
      }
    }
  }
}

export async function handleInstallPackage(projectId: string, args: ToolCall['args']) {
  const packageName = typeof args?.packageName === 'string' ? args.packageName : '';
  if (!packageName.trim()) {
    throw new Error('packageName is required');
  }

  const container = await getOrEnsureContainer(projectId);
  const result = await installPackage(container, packageName);
  if (result.success) {
    try {
      await ensureKernelSeesInstalledPackages(projectId, container, packageName);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error
          ? error.message
          : `Installed package "${packageName}" is not importable in the live kernel.`,
      };
    }
  }
  return result;
}

export async function handleUninstallPackage(projectId: string, args: ToolCall['args']) {
  const packageName = typeof args?.packageName === 'string' ? args.packageName : '';
  if (!packageName.trim()) {
    throw new Error('packageName is required');
  }

  const container = await getOrEnsureContainer(projectId);
  const result = await uninstallPackage(container, packageName);
  return result;
}

export async function handleListPackages(projectId: string) {
  const container = await getOrEnsureContainer(projectId);
  const packages = await listPackages(container);
  return { packages };
}

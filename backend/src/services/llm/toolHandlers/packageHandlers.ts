/**
 * Package Management Tool Handlers - implementations for package-related tool calls
 */

import type { ToolCall } from '../../../types/llm.js';
import { getOrEnsureContainer } from '../../notebook/cellExecutionService.js';
import { installPackage, listPackages, uninstallPackage } from '../../packageManager.js';

export async function handleInstallPackage(projectId: string, args: ToolCall['args']) {
  const packageName = typeof args?.packageName === 'string' ? args.packageName : '';
  if (!packageName.trim()) {
    throw new Error('packageName is required');
  }

  const container = await getOrEnsureContainer(projectId);
  const result = await installPackage(container, packageName);
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

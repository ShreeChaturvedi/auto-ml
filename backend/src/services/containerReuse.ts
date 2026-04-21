import { resolve } from 'node:path';

import type { Container, ContainerConfig } from './container/types.js';

export function normalizeWorkspacePath(path: string): string {
  return resolve(path);
}

export function canReuseContainerForConfig(container: Container, config: ContainerConfig): boolean {
  return (
    container.projectId === config.projectId &&
    container.pythonVersion === config.pythonVersion &&
    normalizeWorkspacePath(container.workspacePath) === normalizeWorkspacePath(config.workspacePath)
  );
}

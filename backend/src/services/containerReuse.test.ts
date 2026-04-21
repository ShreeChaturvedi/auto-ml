import { describe, expect, it } from 'vitest';

import type { Container } from './container/types.js';
import { canReuseContainerForConfig, normalizeWorkspacePath } from './containerReuse.js';

describe('containerReuse', () => {
  const baseContainer: Container = {
    id: 'container-1',
    containerId: 'docker-1',
    projectId: 'project-1',
    pythonVersion: '3.11',
    workspacePath: '/tmp/workspace/project-1',
    kernelGatewayPort: 9999,
    createdAt: new Date('2026-04-15T00:00:00Z'),
    lastUsedAt: new Date('2026-04-15T00:00:00Z'),
  };

  it('normalizes workspace paths to absolute paths', () => {
    expect(normalizeWorkspacePath('/tmp/workspace/project-1/../project-1')).toBe('/tmp/workspace/project-1');
  });

  it('reuses a container only when project, python version, and workspace path all match', () => {
    expect(canReuseContainerForConfig(baseContainer, {
      projectId: 'project-1',
      pythonVersion: '3.11',
      workspacePath: '/tmp/workspace/project-1',
    })).toBe(true);

    expect(canReuseContainerForConfig(baseContainer, {
      projectId: 'project-1',
      pythonVersion: '3.11',
      workspacePath: '/tmp/workspace/project-1/model-runtime',
    })).toBe(false);
  });

  it('does not reuse a container across projects or python versions', () => {
    expect(canReuseContainerForConfig(baseContainer, {
      projectId: 'project-2',
      pythonVersion: '3.11',
      workspacePath: '/tmp/workspace/project-1',
    })).toBe(false);

    expect(canReuseContainerForConfig(baseContainer, {
      projectId: 'project-1',
      pythonVersion: '3.10',
      workspacePath: '/tmp/workspace/project-1',
    })).toBe(false);
  });
});

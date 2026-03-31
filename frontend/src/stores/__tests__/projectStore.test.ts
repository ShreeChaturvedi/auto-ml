import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateProject as apiUpdateProject } from '../../lib/api/projects';
import { useProjectStore } from '../projectStore';
import type { Project } from '../../types/project';

vi.mock('../../lib/api/projects', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn(),
  updateProject: vi.fn()
}));

const updateProjectMock = vi.mocked(apiUpdateProject);

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    title: 'Project 1',
    description: 'Test project',
    icon: 'Folder',
    color: 'blue',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    currentPhase: 'upload',
    unlockedPhases: ['upload', 'data-viewer'],
    completedPhases: [],
    metadata: {},
    ...overrides
  };
}

function resetProjectStore(project = makeProject()) {
  useProjectStore.setState({
    projects: [project],
    activeProjectId: project.id,
    isInitialized: true,
    isLoading: false,
    error: undefined
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('projectStore updateProject', () => {
  beforeEach(() => {
    updateProjectMock.mockReset();
    localStorage.clear();
    resetProjectStore();
  });

  it('does not let a stale metadata response overwrite a newer local phase change', async () => {
    const staleResponse = deferred<{
      project: {
        id: string;
        name: string;
        description?: string;
        icon?: string;
        color?: string;
        createdAt: string;
        updatedAt: string;
        metadata: Record<string, unknown>;
      };
    }>();

    updateProjectMock
      .mockImplementationOnce(() => staleResponse.promise)
      .mockResolvedValueOnce({
        project: {
          id: 'project-1',
          name: 'Project 1',
          description: 'Test project',
          icon: 'Folder',
          color: 'blue',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:01.000Z',
          metadata: {
            currentPhase: 'data-viewer',
            unlockedPhases: ['upload', 'data-viewer'],
            completedPhases: []
          }
        }
      });

    const pendingUpdate = useProjectStore.getState().updateProject('project-1', {
      metadata: {
        uploadStage: 'processing'
      }
    });

    useProjectStore.getState().setCurrentPhase('project-1', 'data-viewer');

    staleResponse.resolve({
      project: {
        id: 'project-1',
        name: 'Project 1',
        description: 'Test project',
        icon: 'Folder',
        color: 'blue',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:02.000Z',
        metadata: {
          currentPhase: 'upload',
          unlockedPhases: ['upload', 'data-viewer'],
          completedPhases: [],
          uploadStage: 'processing'
        }
      }
    });

    await pendingUpdate;

    const current = useProjectStore.getState().getProjectById('project-1');
    expect(current?.currentPhase).toBe('data-viewer');
    expect(current?.metadata?.uploadStage).toBe('processing');
  });
});

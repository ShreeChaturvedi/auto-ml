import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectPlans } from '../useProjectPlans';

const navigateMock = vi.fn();
const updateProjectMock = vi.fn(() => Promise.resolve(undefined));

let projectState: {
  projects: Array<{
    id: string;
    metadata?: Record<string, unknown>;
  }>;
};

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      projects: projectState.projects,
      updateProject: updateProjectMock,
    }),
}));

describe('useProjectPlans', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    updateProjectMock.mockReset();
    updateProjectMock.mockResolvedValue(undefined);

    projectState = {
      projects: [
        {
          id: 'p1',
          metadata: {
            plans: [
              { id: 'plan-1', name: 'Plan 1', content: '# Plan 1\n\nBody' },
            ],
            activePlanId: 'plan-1',
            projectPlanName: 'Plan 1',
            projectPlan: '# Plan 1\n\nBody',
          },
        },
      ],
    };
  });

  it('sends explicit clear values when deleting the last remaining plan', () => {
    const { result } = renderHook(() => useProjectPlans('p1'));

    act(() => {
      result.current.handleDeletePlan('plan-1');
    });

    expect(updateProjectMock).toHaveBeenCalledWith('p1', {
      metadata: expect.objectContaining({
        plans: [],
        activePlanId: null,
        projectPlanName: '',
        projectPlan: '',
      }),
    });
  });

  it('promotes the next remaining plan when deleting the active one', () => {
    projectState.projects[0].metadata = {
      plans: [
        { id: 'plan-1', name: 'Plan 1', content: '# Plan 1\n\nBody' },
        { id: 'plan-2', name: 'Plan 2', content: '# Plan 2\n\nNext' },
      ],
      activePlanId: 'plan-1',
      projectPlanName: 'Plan 1',
      projectPlan: '# Plan 1\n\nBody',
    };

    const { result } = renderHook(() => useProjectPlans('p1'));

    act(() => {
      result.current.handleDeletePlan('plan-1');
    });

    expect(updateProjectMock).toHaveBeenCalledWith('p1', {
      metadata: expect.objectContaining({
        plans: [{ id: 'plan-2', name: 'Plan 2', content: '# Plan 2\n\nNext' }],
        activePlanId: 'plan-2',
        projectPlanName: 'Plan 2',
        projectPlan: '# Plan 2\n\nNext',
      }),
    });
  });
});

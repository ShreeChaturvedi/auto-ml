import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePhaseNotebookRecovery } from '../usePhaseNotebookRecovery';

const recoveryMocks = vi.hoisted(() => ({
  hydrateStoredMessages: vi.fn(),
  recoverNotebook: vi.fn(),
  initializeNotebook: vi.fn(),
  currentProjectId: null as string | null,
  activeNotebookId: null as string | null
}));

vi.mock('../agenticLoopStorage', () => ({
  hydrateStoredMessages: (...args: unknown[]) => recoveryMocks.hydrateStoredMessages(...args)
}));

vi.mock('@/lib/api/notebooks', () => ({
  recoverNotebook: (...args: unknown[]) => recoveryMocks.recoverNotebook(...args)
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: Object.assign(
    (selector: (state: typeof recoveryMocks) => unknown) => selector(recoveryMocks),
    {
      getState: () => recoveryMocks
    }
  )
}));

describe('usePhaseNotebookRecovery', () => {
  beforeEach(() => {
    recoveryMocks.hydrateStoredMessages.mockReset();
    recoveryMocks.hydrateStoredMessages.mockReturnValue({
      messages: [{ id: 'm1', type: 'user', content: 'hello' }]
    });
    recoveryMocks.recoverNotebook.mockReset();
    recoveryMocks.recoverNotebook.mockResolvedValue({ status: 'recovered' });
    recoveryMocks.initializeNotebook.mockReset();
    recoveryMocks.currentProjectId = null;
    recoveryMocks.activeNotebookId = null;
  });

  it('skips recovery when the requested notebook is already active in the notebook store', () => {
    recoveryMocks.currentProjectId = 'project-1';
    recoveryMocks.activeNotebookId = 'nb-1';

    const { result } = renderHook(() => usePhaseNotebookRecovery({
      projectId: 'project-1',
      phase: 'training',
      notebookId: 'nb-1',
      storageKey: 'training-messages-v1-training-wb-1-project-1',
      enabled: true
    }));

    expect(result.current.isRecoveryReady).toBe(true);
    expect(recoveryMocks.recoverNotebook).not.toHaveBeenCalled();
  });

  it('only attempts the same recovery key once across remounts', async () => {
    const props = {
      projectId: 'project-1',
      phase: 'feature-engineering' as const,
      notebookId: 'nb-2',
      storageKey: 'feature-engineering-messages-v3-draft-1',
      enabled: true
    };

    const first = renderHook(() => usePhaseNotebookRecovery(props));

    await waitFor(() => {
      expect(first.result.current.isRecoveryReady).toBe(true);
    });

    expect(recoveryMocks.recoverNotebook).toHaveBeenCalledTimes(1);

    first.unmount();

    const second = renderHook(() => usePhaseNotebookRecovery(props));

    expect(second.result.current.isRecoveryReady).toBe(true);
    expect(recoveryMocks.recoverNotebook).toHaveBeenCalledTimes(1);
  });
});

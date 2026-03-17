import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectStore } from '@/stores/projectStore';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';

import { NlQueryWorkflow } from '../NlQueryWorkflow';
import {
  buildProps,
  createDeferred,
  fastForwardReveal,
  installConstrainedHeightResizeObserver,
  MOCK_RESULT,
  triggerGenerate
} from './nlQueryWorkflowTestUtils';
import type { NlQueryWorkflowHandle } from '../NlQueryWorkflow';

describe('NlQueryWorkflow streaming behavior', () => {
  beforeEach(() => {
    useProjectStore.setState({
      activeProjectId: null
    });
  });

  it('consumes streamed phase events while generation is in progress', async () => {
    const pending = new Promise<NlGenerationResult>(() => undefined);
    const onGenerate = vi.fn(async (_query: string, onStreamEvent?: (event: NlQueryStreamEvent) => void) => {
      onStreamEvent?.({
        type: 'phase_started',
        phaseId: 'planning',
        summary: 'Planning started',
        timestamp: new Date().toISOString()
      });
      onStreamEvent?.({
        type: 'phase_progress',
        phaseId: 'planning',
        summary: 'Choosing candidate tables',
        timestamp: new Date().toISOString()
      });
      return pending;
    });
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);

    const planningMatches = await screen.findAllByText(/choosing candidate tables/i);
    expect(planningMatches.length).toBeGreaterThan(0);
  });

  it('surfaces streamed phase_failed events for stream parse failures', async () => {
    const pending = new Promise<NlGenerationResult>(() => undefined);
    const onGenerate = vi.fn(async (_query: string, onStreamEvent?: (event: NlQueryStreamEvent) => void) => {
      onStreamEvent?.({
        type: 'phase_failed',
        phaseId: 'done',
        summary: 'Failed to parse NL stream response.',
        timestamp: new Date().toISOString()
      });
      return pending;
    });
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);

    const parseFailureMatches = await screen.findAllByText(/failed to parse nl stream response/i);
    expect(parseFailureMatches.length).toBeGreaterThan(0);
  });

  it('does not enter error state when in-flight generation is aborted via reject', async () => {
    const onPhaseChange = vi.fn();
    const onGenerate = vi.fn(
      (_query: string, _onStreamEvent?: (event: NlQueryStreamEvent) => void, signal?: AbortSignal) =>
        new Promise<NlGenerationResult>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate, onPhaseChange })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);
    handleRef.current?.reject();

    expect(onPhaseChange).toHaveBeenCalledWith('submitting');
    expect(onPhaseChange).toHaveBeenCalledWith('idle');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores stale aborted run results when a newer generation completes', async () => {
    vi.useFakeTimers();
    const onApprove = vi.fn();
    const firstRun = createDeferred<NlGenerationResult>();
    const secondResult: NlGenerationResult = {
      ...MOCK_RESULT,
      sql: 'SELECT name FROM users ORDER BY name LIMIT 5;',
      queryId: 'test-query-456'
    };

    const onGenerate = vi.fn(async () => {
      if (onGenerate.mock.calls.length === 1) {
        return firstRun.promise;
      }
      return secondResult;
    });

    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate, onApprove })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);
    await triggerGenerate(handleRef);
    await fastForwardReveal();

    await Promise.resolve(firstRun.resolve(MOCK_RESULT));

    handleRef.current?.approve();

    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({ queryId: 'test-query-456' }),
      secondResult.sql
    );
  });

  it('keeps the model work panel expanded while generation is in progress on constrained height', async () => {
    const restoreResizeObserver = installConstrainedHeightResizeObserver();
    const pending = new Promise<NlGenerationResult>(() => undefined);
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    try {
      render(
        <NlQueryWorkflow
          {...buildProps({ onGenerate: () => pending })}
          ref={handleRef}
        />
      );

      await triggerGenerate(handleRef);

      expect(screen.getByRole('button', { name: /collapse model work panel/i })).toBeInTheDocument();
    } finally {
      restoreResizeObserver();
    }
  });

  it('resets manual collapse override after reject and regenerate on constrained height', async () => {
    const restoreResizeObserver = installConstrainedHeightResizeObserver();
    const onGenerate = vi.fn(() => new Promise<NlGenerationResult>(() => undefined));
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    try {
      render(
        <NlQueryWorkflow
          {...buildProps({ onGenerate })}
          ref={handleRef}
        />
      );

      await triggerGenerate(handleRef);

      fireEvent.click(screen.getByRole('button', { name: /collapse model work panel/i }));
      expect(screen.getByRole('button', { name: /expand model work panel/i })).toBeInTheDocument();

      handleRef.current?.reject();
      await vi.waitFor(() => {
        expect(screen.queryByTestId('nl-work-plan-panel')).not.toBeInTheDocument();
      });
      await triggerGenerate(handleRef);

      expect(await screen.findByRole('button', { name: /collapse model work panel/i })).toBeInTheDocument();
      expect(onGenerate).toHaveBeenCalledTimes(2);
    } finally {
      restoreResizeObserver();
    }
  });

  it('renders streamed model work blocks while generation is in progress', async () => {
    vi.useFakeTimers();
    const deferred = createDeferred<NlGenerationResult>();
    const handleRef = { current: null as NlQueryWorkflowHandle | null };
    const onGenerate = vi.fn(async (_query: string, onStreamEvent?: (event: NlQueryStreamEvent) => void) => {
      onStreamEvent?.({
        type: 'model_work_block_started',
        blockId: 'plan-1',
        kind: 'plan',
        title: 'Query planning',
        phaseId: 'planning',
        timestamp: new Date().toISOString()
      });
      onStreamEvent?.({
        type: 'model_work_delta',
        blockId: 'plan-1',
        kind: 'plan',
        title: 'Query planning',
        phaseId: 'planning',
        delta: 'Selecting candidate tables.',
        timestamp: new Date().toISOString()
      });
      return deferred.promise;
    });

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);
    await fastForwardReveal();

    expect(screen.getByTestId('nl-model-work-block-body-plan-1')).toHaveTextContent(
      /selecting candidate tables/i
    );

    deferred.resolve(MOCK_RESULT);
  });
});

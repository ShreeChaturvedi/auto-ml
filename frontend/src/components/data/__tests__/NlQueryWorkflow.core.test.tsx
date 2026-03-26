import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectStore } from '@/stores/projectStore';

import { NlQueryWorkflow } from '../NlQueryWorkflow';
import type { NlGenerationResult } from '@/types/nlQuery';
import {
  buildProps,
  fastForwardReveal,
  MOCK_RESULT,
  triggerGenerate
} from './nlQueryWorkflowTestUtils';
import type { NlQueryWorkflowHandle } from '../NlQueryWorkflow';

describe('NlQueryWorkflow core behavior', () => {
  beforeEach(() => {
    useProjectStore.setState({
      activeProjectId: null
    });
  });

  it('renders the english textarea in idle state', () => {
    render(<NlQueryWorkflow {...buildProps()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders provided suggestions as placeholder prompts', async () => {
    render(
      <NlQueryWorkflow
        {...buildProps({
          englishQuery: '',
          suggestions: [
            {
              id: 'suggestion-1',
              prompt: 'Compare weekly revenue and average order value over the last 8 weeks.',
              label: 'Weekly revenue trends',
              category: 'trend',
              tables: ['orders'],
              rationale: 'Uses time and revenue metrics.'
            }
          ]
        })}
      />
    );

    expect(await screen.findAllByText(/compare weekly revenue and average order value/i)).not.toHaveLength(0);
  });

  it('calls onQueryChange when user types in the textarea', () => {
    const onQueryChange = vi.fn();
    render(<NlQueryWorkflow {...buildProps({ onQueryChange })} />);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'List all orders' }
    });

    expect(onQueryChange).toHaveBeenCalledWith('List all orders');
  });

  it('keeps both NlFlowConnector wrappers collapsed in idle state', () => {
    render(<NlQueryWorkflow {...buildProps()} />);

    expect(screen.queryByTestId('nl-flow-connector-top')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nl-flow-connector-bottom')).not.toBeInTheDocument();
  });

  it('transitions to submitting when triggerGenerate is called', async () => {
    const onPhaseChange = vi.fn();
    const pending = new Promise<NlGenerationResult>(() => undefined);
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate: () => pending, onPhaseChange })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);

    expect(onPhaseChange).toHaveBeenCalledWith('submitting');
  });

  it('calls onGenerate with the current englishQuery text', async () => {
    const onGenerate = vi.fn().mockResolvedValue(MOCK_RESULT);
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);

    expect(onGenerate).toHaveBeenCalledWith(
      'Show me the first 10 users',
      expect.any(Function),
      expect.any(AbortSignal)
    );
  });

  it('shows an error message when onGenerate rejects', async () => {
    const onGenerate = vi.fn().mockRejectedValue(new Error('Network error'));
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });

  it('calls onPhaseChange with error when generation fails', async () => {
    const onPhaseChange = vi.fn();
    const onGenerate = vi.fn().mockRejectedValue(new Error('Server down'));
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onGenerate, onPhaseChange })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);

    expect(onPhaseChange).toHaveBeenCalledWith('error');
  });

  it('resets to idle when reject is called after review is reached', async () => {
    vi.useFakeTimers();
    const onPhaseChange = vi.fn();
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onPhaseChange })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);
    await fastForwardReveal();

    handleRef.current?.reject();

    expect(onPhaseChange).toHaveBeenCalledWith('reviewing');
    expect(onPhaseChange).toHaveBeenCalledWith('idle');
  });

  it('calls onApprove and resets to idle when approve is called after generation', async () => {
    vi.useFakeTimers();
    const onApprove = vi.fn();
    const onPhaseChange = vi.fn();
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onApprove, onPhaseChange })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);
    await fastForwardReveal();

    handleRef.current?.approve();

    expect(onPhaseChange).toHaveBeenCalledWith('reviewing');
    expect(onApprove).toHaveBeenCalledWith(MOCK_RESULT, MOCK_RESULT.sql);
    expect(onPhaseChange).toHaveBeenCalledWith('idle');
  });

  it('renders the model work panel during review', async () => {
    vi.useFakeTimers();
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps()}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);
    await fastForwardReveal();

    expect(screen.getByTestId('nl-work-plan-panel')).toBeInTheDocument();
  });

  it('reports revealing and reviewing phases through onPhaseChange', async () => {
    vi.useFakeTimers();
    const phases: string[] = [];
    const onPhaseChange = vi.fn((phase) => phases.push(phase));
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ onPhaseChange })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);
    await fastForwardReveal();

    expect(phases).toContain('revealing');
    expect(phases).toContain('reviewing');
  });

  it('does not call onGenerate when englishQuery is empty', async () => {
    const onGenerate = vi.fn().mockResolvedValue(MOCK_RESULT);
    const handleRef = { current: null as NlQueryWorkflowHandle | null };

    render(
      <NlQueryWorkflow
        {...buildProps({ englishQuery: '   ', onGenerate })}
        ref={handleRef}
      />
    );

    await triggerGenerate(handleRef);

    expect(onGenerate).not.toHaveBeenCalled();
  });
});

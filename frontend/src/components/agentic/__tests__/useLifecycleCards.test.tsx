import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/types/llmUi';

import { useLifecycleCards } from '../useLifecycleCards';

function CardHarness({ message }: { message: ChatMessage }) {
  const renderLifecycleCard = useLifecycleCards();
  return <>{renderLifecycleCard(message)}</>;
}

function renderWithRoute(message: ChatMessage) {
  return render(
    <MemoryRouter initialEntries={['/project/project-1/training']}>
      <Routes>
        <Route
          path="/project/:projectId/*"
          element={<CardHarness message={message} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('useLifecycleCards', () => {
  it('renders execute_training with output.status=failed as a failed execution card', () => {
    const message: ChatMessage = {
      id: 'm-1',
      type: 'tool_call',
      call: {
        id: 'call-1',
        tool: 'execute_training',
        args: { experimentId: 'exp-1' }
      },
      result: {
        id: 'call-1',
        tool: 'execute_training',
        output: {
          status: 'failed',
          errorMessage: 'Execution timed out after 30000ms',
          trainingDurationMs: 30064
        }
      }
    };

    renderWithRoute(message);

    expect(screen.getByText('Execution failed')).toBeInTheDocument();
    expect(screen.getByText(/Execution timed out after 30000ms/)).toBeInTheDocument();
  });

  it('treats execute_feature with output.status=ok as a successful execution card', () => {
    const message: ChatMessage = {
      id: 'm-2',
      type: 'tool_call',
      call: {
        id: 'call-2',
        tool: 'execute_feature',
        args: { featureId: 'feat-1' }
      },
      result: {
        id: 'call-2',
        tool: 'execute_feature',
        output: {
          status: 'ok',
          succeeded: true,
          executionMs: 71,
          stdout: ''
        }
      }
    };

    renderWithRoute(message);

    expect(screen.getByText('Execution succeeded')).toBeInTheDocument();
    expect(screen.queryByText('Execution failed')).not.toBeInTheDocument();
  });

  it('does not render configure_experiment as an approval proposal card', () => {
    const message: ChatMessage = {
      id: 'm-3',
      type: 'tool_call',
      call: {
        id: 'call-3',
        tool: 'configure_experiment',
        args: { experimentName: 'Feature_v1 Random Forest Regressor' }
      },
      result: {
        id: 'call-3',
        tool: 'configure_experiment',
        output: {
          status: 'configured',
          experimentId: 'exp-1',
          experimentName: 'Feature_v1 Random Forest Regressor'
        }
      }
    };

    const { container } = renderWithRoute(message);

    expect(container).toBeEmptyDOMElement();
  });

  it('uses the experiment name for training plan proposal cards', () => {
    const message: ChatMessage = {
      id: 'm-4',
      type: 'tool_call',
      call: {
        id: 'call-4',
        tool: 'propose_training_plan',
        args: { experimentId: 'exp-1', rationale: 'Good baseline.' }
      },
      result: {
        id: 'call-4',
        tool: 'propose_training_plan',
        output: {
          status: 'awaiting_approval',
          experimentId: 'exp-1',
          experimentName: 'Feature_v1 Random Forest Regressor'
        }
      }
    };

    renderWithRoute(message);

    expect(screen.getByText('Feature_v1 Random Forest Regressor')).toBeInTheDocument();
    expect(screen.queryByText('Propose Training Plan')).not.toBeInTheDocument();
  });
});

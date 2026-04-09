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
});

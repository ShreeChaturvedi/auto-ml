import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { PlanningStage } from '../PlanningStage';
import { streamOnboardingPlan } from '@/lib/api/llm';

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      files: [],
      addFile: vi.fn(),
      setFileMetadata: vi.fn(),
    }),
}));

vi.mock('@/lib/api/llm', () => ({
  streamOnboardingPlan: vi.fn(),
  executeToolCalls: vi.fn(() => Promise.resolve({ results: [] })),
}));

vi.mock('@/lib/api/documents', () => ({
  uploadDocument: vi.fn(),
}));

describe('PlanningStage Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders plan editor with accessible label when editing a plan', async () => {
    // Mock the stream to immediately emit a plan_exit event
    (streamOnboardingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'plan_exit',
        planMarkdown: '# Test Plan\n\nThis is a test plan.',
        planName: 'test-plan.md',
      });
      onEvent({ type: 'done' });
    });

    render(
      <PlanningStage
        projectId="p1"
        onPlanApproved={vi.fn()}
      />
    );

    // Initial render adds a welcome message, then we type something and send to trigger stream
    const input = screen.getByPlaceholderText(/describe your goal/i);
    fireEvent.change(input, { target: { value: 'make a plan' } });
    
    // Send message using aria-label
    const sendButton = screen.getByRole('button', { name: 'Send message' });
    fireEvent.click(sendButton);

    // Wait for the plan view button to appear
    const planView = await screen.findByTestId(/plan-view-/);
    
    // Click to edit
    fireEvent.click(planView);

    // Verify textarea has accessible label
    const textarea = screen.getByRole('textbox', { name: /Edit plan plans\/test-plan.md/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('# Test Plan\n\nThis is a test plan.');
  });
});

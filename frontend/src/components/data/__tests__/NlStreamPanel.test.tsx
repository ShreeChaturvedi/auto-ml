import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NlModelWorkBlockState } from '@/types/nlQuery';

import { NlStreamPanel } from '../NlStreamPanel';

vi.mock('@/components/llm/ProgressiveMessageText', () => ({
  ProgressiveMessageText: ({ text }: { text: string }) => <span>{text}</span>
}));

function makeBlock(overrides: Partial<NlModelWorkBlockState> = {}): NlModelWorkBlockState {
  return {
    blockId: 'plan-1',
    kind: 'plan',
    title: 'Query planning',
    phaseId: 'planning',
    content: 'Selecting candidate tables.',
    status: 'streaming',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('NlStreamPanel', () => {
  it('renders blocks with streaming content', () => {
    render(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock()]}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    expect(screen.getByTestId('nl-stream-panel')).toBeInTheDocument();
    expect(screen.getByTestId('nl-stream-block-plan-1')).toBeInTheDocument();
    expect(screen.getByText(/selecting candidate tables/i)).toBeInTheDocument();
  });

  it('shows spinner during streaming and hides when not streaming', () => {
    const { rerender } = render(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock()]}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    // Spinner should be present (Loader2 is aria-hidden, check by role)
    const panel = screen.getByTestId('nl-stream-panel');
    expect(panel.querySelector('.animate-spin')).toBeTruthy();

    rerender(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock({ status: 'completed' })]}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    expect(panel.querySelector('.animate-spin')).toBeFalsy();
  });

  it('fires toggle callback and aria-label updates', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock()]}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={onToggle}
        containerHeight={1000}
      />
    );

    const collapseBtn = screen.getByRole('button', { name: /collapse transcript/i });
    expect(collapseBtn).toBeInTheDocument();
    fireEvent.click(collapseBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock()]}
        isStreaming
        isExpanded={false}
        autoCollapsed={false}
        onToggleExpanded={onToggle}
        containerHeight={1000}
      />
    );

    expect(screen.getByRole('button', { name: /expand transcript/i })).toBeInTheDocument();
  });

  it('shows placeholder when no blocks and streaming', () => {
    render(
      <NlStreamPanel
        modelWorkBlocks={[]}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    expect(screen.getByText(/analyzing query/i)).toBeInTheDocument();
  });

  it('renders viewport with correct test id', () => {
    render(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock()]}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    expect(screen.getByTestId('nl-stream-viewport')).toBeInTheDocument();
  });

  it('renders an icon SVG in the block header', () => {
    render(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock()]}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    const header = screen.getByTestId('nl-stream-header-plan-1');
    expect(header.querySelector('svg')).toBeTruthy();
  });

  it('applies shimmer-text to streaming block title and removes it when completed', () => {
    const { rerender } = render(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock({ status: 'streaming' })]}
        isStreaming
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    const header = screen.getByTestId('nl-stream-header-plan-1');
    const titleSpan = header.querySelector('span.shimmer-text');
    expect(titleSpan).toBeTruthy();

    rerender(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock({ status: 'completed' })]}
        isStreaming={false}
        isExpanded
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    expect(header.querySelector('span.shimmer-text')).toBeFalsy();
  });

  it('shows done indicator when collapsed after streaming', () => {
    render(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock({ status: 'completed' })]}
        isStreaming={false}
        isExpanded={false}
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('does not show done indicator while still streaming', () => {
    render(
      <NlStreamPanel
        modelWorkBlocks={[makeBlock({ status: 'streaming' })]}
        isStreaming
        isExpanded={false}
        autoCollapsed={false}
        onToggleExpanded={vi.fn()}
        containerHeight={1000}
      />
    );

    expect(screen.queryByText('Done')).not.toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ChatPanel } from '../ChatPanel';
import { streamTrainingPlan } from '@/lib/api/llm';

const addFileMock = vi.fn();
const setFileMetadataMock = vi.fn();

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      files: [],
      addFile: addFileMock,
      setFileMetadata: setFileMetadataMock,
    }),
}));

vi.mock('@/lib/api/llm', () => ({
  streamTrainingPlan: vi.fn(),
  executeToolCalls: vi.fn(() => Promise.resolve({ results: [] })),
}));

vi.mock('@/lib/api/documents', () => ({
  uploadDocument: vi.fn(),
}));

describe('Notebook ChatPanel progressive rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      return window.setTimeout(() => callback(performance.now()), 16);
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reveals assistant markdown progressively', async () => {
    const streamed = '**Bold** notebook response';
    (streamTrainingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'token', text: streamed });
      onEvent({ type: 'done' });
    });

    const { container } = render(<ChatPanel projectId="p1" />);

    const input = screen.getByPlaceholderText(/ask ai for help/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'help me' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });

    expect(streamTrainingPlan).toHaveBeenCalled();
    expect(screen.queryByText('Bold', { selector: '[data-streamdown="strong"]' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(container.querySelector('.llm-streamdown')).not.toBeNull();
    expect(screen.getByText('Bold', { selector: '[data-streamdown="strong"]' })).toBeInTheDocument();
  });

  it('renders thinking content with progressive markdown behavior', async () => {
    (streamTrainingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'thinking', text: '**Think** about `code`' });
      onEvent({ type: 'done' });
    });

    render(<ChatPanel projectId="p1" />);

    const input = screen.getByPlaceholderText(/ask ai for help/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'reason this out' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });

    const toggleButton = screen.getByRole('button', { name: /Thought for|Thinking for/i });
    fireEvent.click(toggleButton);

    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(screen.getByText('Think', { selector: '[data-streamdown="strong"]' })).toBeInTheDocument();
    expect(screen.getByText('code', { selector: '[data-streamdown="inline-code"]' })).toBeInTheDocument();
  });
});

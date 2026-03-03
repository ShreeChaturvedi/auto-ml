import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ChatPanel } from '../ChatPanel';
import { streamTrainingPlan } from '@/lib/api/llm';

const dataStoreState = vi.hoisted(() => ({
  files: [] as Array<unknown>,
  addFile: vi.fn(),
  setFileMetadata: vi.fn()
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) => selector(dataStoreState)
}));

vi.mock('@/lib/api/documents', () => ({
  uploadDocument: vi.fn()
}));

vi.mock('@/lib/api/llm', () => ({
  streamTrainingPlan: vi.fn(),
  executeToolCalls: vi.fn().mockResolvedValue({ results: [] })
}));

describe('Notebook ChatPanel progressive rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      return window.setTimeout(() => callback(performance.now()), 16);
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      window.clearTimeout(id);
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reveals assistant response progressively', async () => {
    const assistantText = 'Hello notebook assistant';
    (streamTrainingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'token', text: assistantText });
      onEvent({ type: 'done' });
    });

    const { container } = render(<ChatPanel projectId="project-1" />);
    const input = screen.getByPlaceholderText('Ask AI for help...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Help me' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });
    expect(streamTrainingPlan).toHaveBeenCalled();

    expect(screen.queryByText(assistantText)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(container.querySelectorAll('.llm-char-enter').length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByText(assistantText)).toBeInTheDocument();
  });

  it('progressively reveals thinking content and finalizes after done', async () => {
    const thinkingText = '# Reasoning step\n\nDetails';
    (streamTrainingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'thinking', text: thinkingText });
      onEvent({ type: 'done' });
    });

    const { container } = render(<ChatPanel projectId="project-2" />);
    const input = screen.getByPlaceholderText('Ask AI for help...');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Think out loud' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });

    const thinkingToggle = screen.getByRole('button', { name: /(Thinking|Thought) for/i });
    fireEvent.click(thinkingToggle);
    expect(screen.queryByRole('heading', { level: 1, name: 'Reasoning step' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(64);
    });
    expect(container.querySelectorAll('.llm-char-enter').length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Reasoning step' })).toBeInTheDocument();
  });
});

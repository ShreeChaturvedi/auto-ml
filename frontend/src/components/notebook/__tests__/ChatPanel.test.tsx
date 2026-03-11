import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ChatPanel } from '../ChatPanel';
import { streamTrainingPlan } from '@/lib/api/llm';
import { setupRafAnimationClock, teardownRafAnimationClock } from '@/test/rafAnimationTestUtils';

const { mockUseLlmModelCatalog } = vi.hoisted(() => ({
  mockUseLlmModelCatalog: vi.fn(),
}));

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

vi.mock('@/hooks/useLlmModelCatalog', () => ({
  useLlmModelCatalog: () => mockUseLlmModelCatalog(),
}));

function createMockModelCatalogState() {
  return {
    catalog: null,
    featuredModelOptions: [
      {
        value: 'gpt-5.4',
        label: 'GPT 5.4',
        kind: 'base',
        description: 'Best default for most chats and agentic planning.',
        supportedReasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'high',
        featured: true,
      },
      {
        value: 'gpt-5.3-codex',
        label: 'GPT 5.3 Codex',
        kind: 'codex',
        description: 'Best when the chat is code-heavy or tool-oriented.',
        supportedReasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'high',
        featured: true,
      },
      {
        value: 'gpt-5-mini',
        label: 'GPT 5 Mini',
        kind: 'mini',
        description: 'Faster and cheaper while still strong for everyday work.',
        supportedReasoningEfforts: ['none', 'low', 'medium', 'high'],
        defaultReasoningEffort: 'medium',
        featured: true,
      },
      {
        value: 'gpt-5-nano',
        label: 'GPT 5 Nano',
        kind: 'nano',
        description: 'Best for quick lightweight tasks and short prompts.',
        supportedReasoningEfforts: ['none', 'low', 'medium', 'high'],
        defaultReasoningEffort: 'low',
        featured: true,
      },
    ],
    allModelOptions: [
      {
        value: 'gpt-5.4',
        label: 'GPT 5.4',
        kind: 'base',
        description: 'Best default for most chats and agentic planning.',
        supportedReasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'high',
        featured: true,
      },
      {
        value: 'gpt-5.3-codex',
        label: 'GPT 5.3 Codex',
        kind: 'codex',
        description: 'Best when the chat is code-heavy or tool-oriented.',
        supportedReasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'high',
        featured: true,
      },
      {
        value: 'gpt-5-mini',
        label: 'GPT 5 Mini',
        kind: 'mini',
        description: 'Faster and cheaper while still strong for everyday work.',
        supportedReasoningEfforts: ['none', 'low', 'medium', 'high'],
        defaultReasoningEffort: 'medium',
        featured: true,
      },
      {
        value: 'gpt-5-nano',
        label: 'GPT 5 Nano',
        kind: 'nano',
        description: 'Best for quick lightweight tasks and short prompts.',
        supportedReasoningEfforts: ['none', 'low', 'medium', 'high'],
        defaultReasoningEffort: 'low',
        featured: true,
      },
    ],
    defaultModel: 'gpt-5.4',
    defaultReasoningEffort: 'high',
    isLoading: false,
    error: null,
  };
}

describe('Notebook ChatPanel progressive rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLlmModelCatalog.mockReturnValue(createMockModelCatalogState());
    localStorage.clear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    setupRafAnimationClock();
  });

  afterEach(() => {
    teardownRafAnimationClock();
  });

  it('reveals assistant markdown progressively', async () => {
    const streamed = '**Bold** notebook response';
    (streamTrainingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'token', text: streamed });
      onEvent({ type: 'done' });
    });

    const { container } = render(<ChatPanel projectId="p1" />);

    const input = screen.getByRole('textbox', { name: 'Message input' });
    await act(async () => {
      input.textContent = 'help me';
      fireEvent.input(input);
    });
    await act(async () => {
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

    const input = screen.getByRole('textbox', { name: 'Message input' });
    await act(async () => {
      input.textContent = 'reason this out';
      fireEvent.input(input);
    });
    await act(async () => {
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

  it('does not replay animation for hydrated assistant history', () => {
    localStorage.setItem(
      'notebook-messages-p-hydrated',
      JSON.stringify([
        {
          id: 'a1',
          type: 'assistant_text',
          content: '# Hydrated Heading',
        },
      ])
    );

    const { container } = render(<ChatPanel projectId="p-hydrated" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Hydrated Heading' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-sd-animate]')).toHaveLength(0);
  });

  it('sanitizes streamed assistant artifacts before rendering markdown', async () => {
    (streamTrainingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'token', text: 'Visible output\n<<<JSON>>>\n{"version":"1"}' });
      onEvent({ type: 'done' });
    });

    render(<ChatPanel projectId="p-sanitize" />);

    const input = screen.getByRole('textbox', { name: 'Message input' });
    await act(async () => {
      input.textContent = 'show output';
      fireEvent.input(input);
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText('Visible output')).toBeInTheDocument();
    expect(screen.queryByText(/<<<JSON>>>/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"version":"1"/)).not.toBeInTheDocument();
  });

  it('sends GPT-5 model and reasoningEffort without legacy thinking fields', async () => {
    (streamTrainingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'done' });
    });

    render(<ChatPanel projectId="p1" />);

    const input = screen.getByRole('textbox', { name: 'Message input' });
    await act(async () => {
      input.textContent = 'help me debug this notebook';
      fireEvent.input(input);
    });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      await Promise.resolve();
    });

    const request = (streamTrainingPlan as Mock).mock.calls.at(-1)?.[0];
    expect(request).toMatchObject({
      model: 'gpt-5.4',
      reasoningEffort: 'high',
    });
    expect(request).not.toHaveProperty('enableThinking');
    expect(request).not.toHaveProperty('thinkingLevel');
  });
});

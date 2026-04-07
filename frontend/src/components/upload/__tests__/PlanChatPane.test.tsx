import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { PlanChatPane } from '../PlanChatPane';
import { streamOnboardingPlan } from '@/lib/api/llm';
import { uploadDatasetFile } from '@/lib/api/datasets';
import { uploadDocument } from '@/lib/api/documents';
import { setupRafAnimationClock, teardownRafAnimationClock } from '@/test/rafAnimationTestUtils';

const { mockUseLlmModelCatalog } = vi.hoisted(() => ({
  mockUseLlmModelCatalog: vi.fn(),
}));

const addFileMock = vi.fn();
const addPreviewMock = vi.fn();
const setFileMetadataMock = vi.fn();
const hydrateFromBackendMock = vi.fn();
const fetchProjectSuggestionsMock = vi.fn();

vi.mock('@/stores/planChatStore', () => ({
  usePlanChatStore: (selector: (state: unknown) => unknown) =>
    selector({
      chats: {},
      renameChat: vi.fn(),
    }),
}));

vi.mock('../PlanChatToolbar', () => ({
  PlanChatToolbar: () => <div data-testid="plan-chat-toolbar" />,
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (state: unknown) => unknown) =>
    selector({
      files: [],
      addFile: addFileMock,
      addPreview: addPreviewMock,
      setFileMetadata: setFileMetadataMock,
      hydrateFromBackend: hydrateFromBackendMock,
    }),
}));

vi.mock('@/stores/nlSuggestionStore', () => ({
  useNlSuggestionStore: (selector: (state: unknown) => unknown) =>
    selector({
      fetchProjectSuggestions: fetchProjectSuggestionsMock,
    }),
}));

vi.mock('@/lib/api/llm', () => ({
  streamOnboardingPlan: vi.fn(),
}));

vi.mock('@/lib/api/documents', () => ({
  uploadDocument: vi.fn(),
}));

vi.mock('@/lib/api/datasets', () => ({
  uploadDatasetFile: vi.fn(),
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
        description: 'Strongest model for complex planning, tool orchestration, and high-stakes work.',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'high',
        featured: true,
      },
      {
        value: 'gpt-5.3-codex',
        label: 'GPT 5.3 Codex',
        kind: 'codex',
        description: 'Use for coding tasks and tool-heavy workflows.',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'high',
        featured: true,
      },
      {
        value: 'gpt-5.4-mini',
        label: 'GPT 5.4 Mini',
        kind: 'mini',
        description: 'Use for most everyday tasks with strong quality at lower cost.',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'medium',
        featured: true,
      },
      {
        value: 'gpt-5.4-nano',
        label: 'GPT 5.4 Nano',
        kind: 'nano',
        description: 'Use for fast, simple tasks and high-volume requests.',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'low',
        featured: true,
      },
    ],
    allModelOptions: [
      {
        value: 'gpt-5.4',
        label: 'GPT 5.4',
        kind: 'base',
        description: 'Strongest model for complex planning, tool orchestration, and high-stakes work.',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'high',
        featured: true,
      },
      {
        value: 'gpt-5.3-codex',
        label: 'GPT 5.3 Codex',
        kind: 'codex',
        description: 'Use for coding tasks and tool-heavy workflows.',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'high',
        featured: true,
      },
      {
        value: 'gpt-5.4-mini',
        label: 'GPT 5.4 Mini',
        kind: 'mini',
        description: 'Use for most everyday tasks with strong quality at lower cost.',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'medium',
        featured: true,
      },
      {
        value: 'gpt-5.4-nano',
        label: 'GPT 5.4 Nano',
        kind: 'nano',
        description: 'Use for fast, simple tasks and high-volume requests.',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
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

describe('PlanChatPane Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLlmModelCatalog.mockReturnValue(createMockModelCatalogState());
    HTMLElement.prototype.scrollIntoView = vi.fn();
    (streamOnboardingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'done' });
    });
  });

  it('renders the generated plan preview and approval controls', async () => {
    (streamOnboardingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'plan_exit',
        planMarkdown: '# Test Plan\n\nThis is a test plan.',
        planName: 'test-plan.md',
      });
      onEvent({ type: 'done' });
    });

    render(
      <PlanChatPane
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

    expect(await screen.findByText('plans/test-plan.md')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test Plan' })).toBeInTheDocument();
    expect(screen.getByText('This is a test plan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve Plan' })).toBeInTheDocument();
  });

  it('queues attachment with preview and allows removing before send', async () => {
    const { container } = render(
      <PlanChatPane
        projectId="p1"
        onPlanApproved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Attach file'));
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();
    expect(fileInput).toHaveAttribute(
      'accept',
      '.pdf,.docx,.md,.markdown,.txt,.log,.json,.csv,.xlsx,.html,.htm,.xml,.yml,.yaml,.rtf'
    );

    const file = new File(['hello world'], 'context.md', { type: 'text/markdown' });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    expect(await screen.findByText('context.md')).toBeInTheDocument();
    expect(screen.getByText('1 attachment ready to send.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove context.md' }));

    await waitFor(() => expect(screen.queryByText('context.md')).not.toBeInTheDocument());
  });

  it('uploads queued attachments on send and shows them in the sent message', async () => {
    (uploadDocument as Mock).mockResolvedValue({
      document: {
        documentId: 'doc-1',
        chunkCount: 12,
        embeddingDimension: 384,
      },
    });

    const { container } = render(
      <PlanChatPane
        projectId="p1"
        onPlanApproved={vi.fn()}
      />
    );

    const file = new File(['alpha'], 'notes.md', { type: 'text/markdown' });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput!, { target: { files: [file] } });

    const input = screen.getByPlaceholderText(/describe your goal or request changes/i);
    fireEvent.change(input, { target: { value: 'use this new document in the plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledWith('p1', file));
    expect(addFileMock).toHaveBeenCalledTimes(1);
    expect(setFileMetadataMock).toHaveBeenCalledTimes(1);
    expect(addPreviewMock).not.toHaveBeenCalled();

    expect(await screen.findByText('use this new document in the plan')).toBeInTheDocument();
    expect(screen.getByText('notes.md')).toBeInTheDocument();
  });

  it('routes csv attachments through dataset upload so planning can use the new dataset', async () => {
    (uploadDatasetFile as Mock).mockResolvedValue({
      dataset: {
        datasetId: 'ds-1',
        projectId: 'p1',
        filename: 'cow_milk_study.csv',
        fileType: 'csv',
        size: 24,
        n_rows: 2,
        n_cols: 2,
        columns: ['id', 'yield'],
        dtypes: { id: 'integer', yield: 'float' },
        null_counts: { id: 0, yield: 0 },
        sample: [{ id: 1, yield: 9.2 }],
        createdAt: '2026-02-27T00:00:00.000Z',
        tableName: 'cow_milk_study_1234',
      },
    });

    const { container } = render(
      <PlanChatPane
        projectId="p1"
        onPlanApproved={vi.fn()}
      />
    );

    const csvFile = new File(['id,yield\n1,9.2'], 'cow_milk_study.csv', { type: 'text/csv' });
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput!, { target: { files: [csvFile] } });

    const input = screen.getByPlaceholderText(/describe your goal or request changes/i);
    fireEvent.change(input, { target: { value: 'build a quick analysis plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(uploadDatasetFile).toHaveBeenCalledWith(csvFile, 'p1'));
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(addPreviewMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const calls = (streamOnboardingPlan as Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const request = calls.at(-1)?.[0] as { userIntent?: string } | undefined;
      expect(request?.userIntent).toContain('Use and prioritize these newly attached files');
      expect(request?.userIntent).toContain('cow_milk_study.csv');
    });
  });

  it('sends GPT-5 model and reasoningEffort without legacy thinking fields', async () => {
    render(
      <PlanChatPane
        projectId="p1"
        onPlanApproved={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/describe your goal or request changes/i);
    fireEvent.change(input, { target: { value: 'build an execution plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(streamOnboardingPlan).toHaveBeenCalled();
    });

    const request = (streamOnboardingPlan as Mock).mock.calls.at(-1)?.[0];
    expect(request).toMatchObject({
      model: 'gpt-5.4',
      reasoningEffort: 'high',
    });
    expect(request).not.toHaveProperty('enableThinking');
    expect(request).not.toHaveProperty('thinkingLevel');
  });
});

describe('PlanChatPane progressive assistant rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    setupRafAnimationClock();
  });

  afterEach(() => {
    teardownRafAnimationClock();
  });

  it('reveals streamed assistant markdown progressively instead of instant full text', async () => {
    const streamed = 'Progressive planning response';
    (streamOnboardingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'token', text: streamed });
      onEvent({ type: 'done' });
    });

    const { container } = render(
      <PlanChatPane
        projectId="p1"
        onPlanApproved={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/describe your goal or request changes/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'create plan' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
      await Promise.resolve();
    });
    expect(streamOnboardingPlan).toHaveBeenCalled();

    expect(screen.queryByText(streamed)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(96);
    });

    const renderedAnimatedNodes = container.querySelectorAll('[data-sd-animate]').length;
    expect(renderedAnimatedNodes).toBeGreaterThan(0);
  });

  it('renders the full markdown heading after stream completion and catch-up', async () => {
    const markdown = '# Final Plan Heading';
    (streamOnboardingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'token', text: markdown });
      onEvent({ type: 'done' });
    });

    render(
      <PlanChatPane
        projectId="p1"
        onPlanApproved={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/describe your goal or request changes/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'finish plan' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
      await Promise.resolve();
    });
    expect(streamOnboardingPlan).toHaveBeenCalled();

    expect(screen.queryByRole('heading', { level: 1, name: 'Final Plan Heading' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByRole('heading', { level: 1, name: 'Final Plan Heading' })).toBeInTheDocument();
  });

  it('sanitizes streamed assistant artifacts before rendering', async () => {
    (streamOnboardingPlan as Mock).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'token', text: 'Visible planning output\n<<<END>>>\n{"version":"1"}' });
      onEvent({ type: 'done' });
    });

    render(
      <PlanChatPane
        projectId="p1"
        onPlanApproved={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/describe your goal or request changes/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'sanitize this response' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText('Visible planning output')).toBeInTheDocument();
    expect(screen.queryByText(/<<<END>>>/)).not.toBeInTheDocument();
    expect(screen.queryByText(/"version":"1"/)).not.toBeInTheDocument();
  });
});

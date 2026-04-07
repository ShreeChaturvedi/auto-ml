import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { DomainAdapter } from '@/types/agentic';

const loopMocks = vi.hoisted(() => ({
  runLoop: vi.fn(),
  editAndResend: vi.fn()
}));

// Mock the entire child component tree to isolate hook-level re-render behavior
vi.mock('../AgenticStepDisplay', () => ({
  AgenticStepDisplay: () => <div data-testid="step-display" />
}));

vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizablePanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResizableHandle: () => <div />
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/notebook/NotebookEditor', () => ({
  NotebookEditor: React.forwardRef(() => null)
}));

vi.mock('@/components/notebook/NotebookToolbar', () => ({
  NotebookToolbar: () => null
}));

vi.mock('@/hooks/useAgenticLoop', () => ({
  useAgenticLoop: () => ({
    messages: [],
    setMessages: vi.fn(),
    isGenerating: false,
    error: null,
    uiSchema: null,
    sessionUsages: [],
    activeTextMessageId: null,
    activeThinkingMessageId: null,
    hydratedMessageIds: new Set(),
    runLoop: loopMocks.runLoop,
    handleStop: vi.fn(),
    clearMessages: vi.fn(),
    editMessage: vi.fn(),
    revertToTurn: vi.fn(),
    editAndResend: loopMocks.editAndResend,
    editingMessageId: null,
    setEditingMessageId: vi.fn(),
    registerSavepoint: vi.fn()
  })
}));

vi.mock('@/hooks/useSavepoints', () => ({
  useSavepoints: () => ({
    savepoints: {},
    diffs: new Map<number, unknown>(),
    loadingSavepointId: null,
    activeSavepointId: null,
    handleLoadSavepoint: vi.fn(),
    handleDismissSavepoint: vi.fn()
  })
}));

vi.mock('@/hooks/useNotebookHeadings', () => ({
  useNotebookHeadings: () => []
}));

vi.mock('@/hooks/useComposerVoiceInput', () => ({
  useComposerVoiceInput: () => ({
    isRecording: false,
    toggleRecording: vi.fn(),
    supported: false
  })
}));

vi.mock('@/hooks/useMentionAutocomplete', () => ({
  useMentionAutocomplete: () => ({
    isOpen: false,
    query: '',
    filtered: [],
    activeIndex: 0,
    handleKeyDown: vi.fn(() => false),
    handleValueChange: vi.fn(),
    selectCandidate: vi.fn(),
    dismiss: vi.fn(),
    resolvedMentions: [],
    removeMention: vi.fn()
  }),
  MentionCandidate: {}
}));

vi.mock('@/hooks/useModelSelection', () => ({
  useModelSelection: () => ({
    selectedModel: 'gpt-5.4',
    reasoningEffort: 'medium',
    inlineModelOptions: [],
    reasoningEffortOptions: [],
    dismissedModelPromptFor: null,
    setDismissedModelPromptFor: vi.fn(),
    handleModelChange: vi.fn(),
    setReasoningEffort: vi.fn()
  })
}));

vi.mock('@/hooks/useProjectThemeColor', () => ({
  useProjectThemeColor: () => ({ themeColor: '#1d4ed8' })
}));

vi.mock('@/stores/notebookStore', () => ({
  useNotebookStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      initializeNotebook: vi.fn(),
      disconnect: vi.fn(),
      activeNotebookId: null
    })
}));

vi.mock('@/stores/dataStore', () => ({
  useDataStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ files: [] })
}));

import { AgenticShell } from '../AgenticShell';

describe('AgenticShell smoke test', () => {
  it('mounts without "Maximum update depth exceeded" error', () => {
    const domainAdapter: DomainAdapter = {
      buildRequest: vi.fn(async () => undefined),
      toolRegistry: {},
      toolUiRegistry: {},
      tipsProvider: () => [],
      preserveToolHistoryBetweenPrompts: true
    };

    expect(() => {
      render(
        <AgenticShell
          projectId="test-project"
          domainAdapter={domainAdapter}
          storageKey="smoke-test"
        />
      );
    }).not.toThrow();
  });

  it('mounts with legacy tips-only adapters', () => {
    const domainAdapter: DomainAdapter = {
      buildRequest: vi.fn(async () => undefined),
      toolRegistry: {},
      toolUiRegistry: {},
      tipsProvider: () => [],
      preserveToolHistoryBetweenPrompts: true
    };

    expect(() => {
      render(
        <AgenticShell
          projectId="test-project"
          domainAdapter={domainAdapter}
          storageKey="legacy-tips-adapter"
        />
      );
    }).not.toThrow();
  });

  it('passes submitPrompt to the left pane render props', async () => {
    loopMocks.runLoop.mockReset();

    const domainAdapter: DomainAdapter = {
      buildRequest: vi.fn(async () => undefined),
      toolRegistry: {},
      toolUiRegistry: {},
      tipsProvider: () => [],
      preserveToolHistoryBetweenPrompts: true
    };

    render(
      <AgenticShell
        projectId="test-project"
        domainAdapter={domainAdapter}
        storageKey="left-pane-submit"
        renderLeftPane={({ submitPrompt }) => (
          <button type="button" onClick={() => submitPrompt?.('Generate notebook steps')}>
            Trigger Submit
          </button>
        )}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Submit' }));

    await waitFor(() => {
      expect(loopMocks.runLoop).toHaveBeenCalledWith(
        'Generate notebook steps',
        expect.objectContaining({
          model: 'gpt-5.4',
          reasoningEffort: 'medium'
        }),
        undefined,
        undefined,
        expect.stringMatching(/^user-/),
        'Generate notebook steps'
      );
    });
  });
});

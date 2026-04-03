import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { DomainAdapter } from '@/types/agentic';

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
    runLoop: vi.fn(),
    handleStop: vi.fn(),
    clearMessages: vi.fn(),
    editMessage: vi.fn(),
    revertToTurn: vi.fn(),
    editAndResend: vi.fn(),
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
});

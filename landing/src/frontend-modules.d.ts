declare module '@frontend/types/llmUi' {
  export interface AskUserQuestionOption {
    label: string;
    description: string;
  }

  export interface AskUserQuestion {
    id: string;
    header: string;
    question: string;
    type: 'single_select' | 'multi_select' | 'text';
    allowCustom?: boolean;
    options?: AskUserQuestionOption[];
  }

  export interface ToolCall {
    id: string;
    tool: string;
    args?: Record<string, unknown>;
  }

  export interface ToolResult {
    id: string;
    tool: string;
    output: unknown;
  }
}

declare module '@frontend/lib/api/execution' {
  export interface RichOutput {
    type: string;
    content?: string;
    data?: unknown;
  }
}

declare module '@frontend/components/upload/QuestionCards' {
  import type { ComponentType } from 'react';
  import type { AskUserQuestion } from '@frontend/types/llmUi';

  export const QuestionCards: ComponentType<{
    questions: AskUserQuestion[];
    onSubmit: (answers: Record<string, unknown>) => void;
    disabled?: boolean;
  }>;
}

declare module '@frontend/components/llm/MentionInput' {
  export type MentionInputHandle = unknown;
}

declare module '@frontend/components/llm/modelOptions' {
  export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

  export interface AssistantModelOption {
    value: string;
    label: string;
    kind: string;
    description?: string;
    supportedReasoningEfforts?: ReasoningEffort[];
    defaultReasoningEffort?: ReasoningEffort;
    featured?: boolean;
  }

  export interface ReasoningEffortOption {
    value: ReasoningEffort;
    label: string;
    icon: string;
  }
}

declare module '@frontend/components/llm/LlmChatComposer' {
  import type { ComponentType } from 'react';

  export const LlmChatComposer: ComponentType<Record<string, unknown>>;
}

declare module '@frontend/components/llm/ToolIndicator' {
  import type { ComponentType } from 'react';

  export const ToolIndicator: ComponentType<Record<string, unknown>>;
}

declare module '@frontend/components/notebook/NotebookCellOutput' {
  import type { ComponentType } from 'react';
  import type { RichOutput } from '@frontend/lib/api/execution';

  export const NotebookCellOutput: ComponentType<{
    outputs: RichOutput[];
  }>;
}

declare module '@frontend/components/ui/tooltip' {
  import type { ComponentType, ReactNode } from 'react';

  export const TooltipProvider: ComponentType<{
    children?: ReactNode;
    delayDuration?: number;
  }>;
}

declare module '@frontend/lib/api/client' {
  export function apiFetch(path: string, init?: RequestInit): Promise<unknown>;
}

declare module '@frontend/lib/demoMode' {
  export function enableDemoMode(): void;
}

declare module '@frontend/pages/projectWorkspacePhaseLoaders' {
  export function preloadProjectWorkspacePhase(phase: string): Promise<unknown> | undefined;
}

declare module '@frontend/demo/landing' {
  import type { ComponentType } from 'react';

  export const DemoWorkspace: ComponentType<{
    initialPhase?: string;
    phase?: string;
  }>;

  export const NotebookDeepDivePreview: ComponentType<Record<string, never>>;
  export function resetLandingDemoState(): void;
}

declare module '@frontend/demo/landing/NotebookDeepDivePreview' {
  import type { ComponentType } from 'react';

  export const NotebookDeepDivePreview: ComponentType<Record<string, never>>;
}

declare module '@frontend/stores/projectStore' {
  export const useProjectStore: {
    getState(): {
      getActiveProject: () => { currentPhase?: string } | undefined;
    };
  };
}

declare module '@frontend/stores/dataStore' {
  export const useDataStore: {
    getState(): {
      activeFileTabId: string | null;
      fileTabType: string | null;
    };
  };
}

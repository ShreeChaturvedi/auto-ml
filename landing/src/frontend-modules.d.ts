declare module '@frontend/components/theme-provider' {
  import type { FC, ReactNode } from 'react';

  export const ThemeProvider: FC<{
    children: ReactNode;
    defaultTheme?: 'dark' | 'light' | 'system';
    storageKey?: string;
  }>;
  export const useTheme: () => {
    theme: 'dark' | 'light' | 'system';
    resolvedTheme: 'dark' | 'light';
    setTheme: (t: 'dark' | 'light' | 'system') => void;
  };
}

declare module '@frontend/components/theme-toggle' {
  import type { FC } from 'react';
  export const ThemeToggle: FC;
}

declare module '@frontend/hooks/useHtmlThemeClass' {
  export function useHtmlThemeClass(): 'dark' | 'light';
}

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

declare module '@frontend/types/phase' {
  export type Phase =
    | 'upload'
    | 'data-viewer'
    | 'preprocessing'
    | 'feature-engineering'
    | 'training'
    | 'experiments'
    | 'deployment';
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
    animateStepChanges?: boolean;
  }>;
}

declare module '@frontend/components/upload/PlanViewerPane' {
  import type { ComponentType } from 'react';

  export const PlanViewerPane: ComponentType<{
    plan: { id: string; name: string; content: string };
    searchQuery?: string;
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

declare module '@frontend/components/training/CellOutputRenderer' {
  import type { ComponentType } from 'react';
  import type { RichOutput } from '@frontend/lib/api/execution';

  export const CellOutputRenderer: ComponentType<{
    outputs: RichOutput[];
    className?: string;
  }>;
}

declare module '@frontend/components/ui/tooltip' {
  import type { ComponentType, ReactNode } from 'react';

  export const TooltipProvider: ComponentType<{
    children?: ReactNode;
    delayDuration?: number;
  }>;
}

declare module '@frontend/components/ui/card' {
  import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react';
  type CardPart = ForwardRefExoticComponent<
    HTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>
  >;
  export const Card: CardPart;
  export const CardHeader: CardPart;
  export const CardTitle: CardPart;
  export const CardDescription: CardPart;
  export const CardContent: CardPart;
  export const CardFooter: CardPart;
}

declare module '@frontend/components/ui/button' {
  import type {
    ButtonHTMLAttributes,
    ForwardRefExoticComponent,
    RefAttributes,
  } from 'react';
  export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-xs';
    asChild?: boolean;
  }
  export const Button: ForwardRefExoticComponent<
    ButtonProps & RefAttributes<HTMLButtonElement>
  >;
}

declare module '@frontend/components/ui/badge' {
  import type { ComponentType, HTMLAttributes } from 'react';
  export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  }
  export const Badge: ComponentType<BadgeProps>;
}

declare module '@frontend/components/ui/progress' {
  import type {
    ComponentPropsWithoutRef,
    ComponentRef,
    ForwardRefExoticComponent,
    RefAttributes,
  } from 'react';
  import type * as ProgressPrimitive from '@radix-ui/react-progress';
  export interface ProgressProps
    extends ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
    /** Optional Tailwind class for the indicator bg. */
    indicatorClassName?: string;
  }
  export const Progress: ForwardRefExoticComponent<
    ProgressProps & RefAttributes<ComponentRef<typeof ProgressPrimitive.Root>>
  >;
}

declare module '@frontend/components/ui/separator' {
  import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react';
  export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
    orientation?: 'horizontal' | 'vertical';
    decorative?: boolean;
  }
  export const Separator: ForwardRefExoticComponent<
    SeparatorProps & RefAttributes<HTMLDivElement>
  >;
}

declare module '@frontend/components/ui/table' {
  import type {
    ForwardRefExoticComponent,
    HTMLAttributes,
    RefAttributes,
    TdHTMLAttributes,
    ThHTMLAttributes,
  } from 'react';
  export const Table: ForwardRefExoticComponent<
    HTMLAttributes<HTMLTableElement> & RefAttributes<HTMLTableElement>
  >;
  export const TableHeader: ForwardRefExoticComponent<
    HTMLAttributes<HTMLTableSectionElement> & RefAttributes<HTMLTableSectionElement>
  >;
  export const TableBody: ForwardRefExoticComponent<
    HTMLAttributes<HTMLTableSectionElement> & RefAttributes<HTMLTableSectionElement>
  >;
  export const TableFooter: ForwardRefExoticComponent<
    HTMLAttributes<HTMLTableSectionElement> & RefAttributes<HTMLTableSectionElement>
  >;
  export const TableRow: ForwardRefExoticComponent<
    HTMLAttributes<HTMLTableRowElement> & RefAttributes<HTMLTableRowElement>
  >;
  export const TableHead: ForwardRefExoticComponent<
    ThHTMLAttributes<HTMLTableCellElement> & RefAttributes<HTMLTableCellElement>
  >;
  export const TableCell: ForwardRefExoticComponent<
    TdHTMLAttributes<HTMLTableCellElement> & RefAttributes<HTMLTableCellElement>
  >;
  export const TableCaption: ForwardRefExoticComponent<
    HTMLAttributes<HTMLTableCaptionElement> & RefAttributes<HTMLTableCaptionElement>
  >;
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

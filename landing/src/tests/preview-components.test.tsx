/**
 * Smoke-test: imports + renders the 6 reused frontend components to catch prop drift.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

// `PdfViewer` is mocked at the module level so vitest never walks into
// `react-pdf` / `pdfjs-dist`. Both of those need browser globals (DOMMatrix,
// Path2D) and a worker asset URL that vite's fs-allow list refuses to
// serve from the shared frontend/node_modules. Compile-time drift is still
// checked because the `PdfViewer` import below resolves to the real `.tsx`
// source for its TypeScript prop signature.
vi.mock('@frontend/components/data/PdfViewer', () => ({
  default: (props: { url: string; fileName?: string; className?: string }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-pdf-viewer', 'data-url': props.url },
      props.fileName ?? 'mock-pdf',
    ),
}));

// Components under test — imported by the real paths so TypeScript
// resolves each one's prop interface from the real `frontend/src/` source.
import { TooltipProvider } from '@frontend/components/ui/tooltip';
import { LlmChatComposer } from '@frontend/components/llm/LlmChatComposer';
import type {
  AssistantModelOption,
  ReasoningEffort,
  ReasoningEffortOption,
} from '@frontend/components/llm/modelOptions';
import { QuestionCards } from '@frontend/components/upload/QuestionCards';
import { NotebookCellOutput } from '@frontend/components/notebook/NotebookCellOutput';
import { ComputeAnimation } from '@frontend/components/upload/ComputeAnimation';
import PdfViewer from '@frontend/components/data/PdfViewer';
import { ToolIndicator } from '@frontend/components/llm/ToolIndicator';
import type { RichOutput } from '@frontend/lib/api/execution';
import type { AskUserQuestion, ToolCall, ToolResult } from '@frontend/types/llmUi';
import type { ProcessingResult } from '@frontend/types/processing';

// ---------------------------------------------------------------------------
// Fixtures — kept in sync with the real landing-page callsites so any
// frontend fixture change is caught alongside prop-signature drift.
// ---------------------------------------------------------------------------

const NOOP = () => {};

/** Mirrors `landing/src/components/deep-dives/ChatDeepDive.tsx`. */
const MODEL_OPTIONS: readonly AssistantModelOption[] = [
  {
    value: 'gpt-5.4',
    label: 'GPT 5.4',
    kind: 'base',
    description:
      'Strongest model for complex planning, tool orchestration, and high-stakes work.',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
  },
];

const REASONING_OPTIONS: readonly ReasoningEffortOption[] = [
  { value: 'low', label: 'Low', icon: 'gauge' },
  { value: 'medium', label: 'Medium', icon: 'brain' },
  { value: 'high', label: 'High', icon: 'flame' },
];

/** Mirrors `landing/src/preview/tabs/UploadView.tsx`. */
const DEMO_FILES: Array<{ name: string; type: string }> = [
  { name: 'customers.csv', type: 'text/csv' },
];

const DEMO_RESULTS: ProcessingResult[] = [
  {
    type: 'dataset_stats',
    icon: 'bar-chart',
    label: '2,530 rows',
    detail: '14 columns',
  },
  {
    type: 'schema_analysis',
    icon: 'table',
    label: '14 columns typed',
    detail: '6 numeric · 8 categorical',
  },
];

const PLAN_QUESTIONS: AskUserQuestion[] = [
  {
    id: 'q1',
    header: 'Target',
    question: "What's your target variable?",
    type: 'single_select',
    options: [
      { label: 'is_active', description: 'Customer churn (classification)' },
      { label: 'mrr_usd', description: 'Recurring revenue (regression)' },
    ],
  },
];

/** Mirrors `landing/src/components/deep-dives/NotebookDeepDive.tsx`. */
const DESCRIBE_OUTPUTS: RichOutput[] = [
  {
    type: 'table',
    content: 'describe() summary',
    data: {
      columns: ['stat', 'mrr_usd'],
      rows: [
        { stat: 'count', mrr_usd: '2,530' },
        { stat: 'mean', mrr_usd: '2,142' },
      ],
    },
  },
];

/** Minimal ToolCall + ToolResult pair for ToolIndicator drift detection. */
const TOOL_CALLS: ToolCall[] = [
  {
    id: 'tc1',
    tool: 'profile_active_dataset',
    args: {},
  },
];

const TOOL_RESULTS: ToolResult[] = [
  {
    id: 'tc1',
    tool: 'profile_active_dataset',
    output: { rowCount: 2530, columnCount: 14 },
  },
];

// ---------------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------------

describe('reused frontend components — prop-interface drift smoke tests', () => {
  it('LlmChatComposer (readOnly) accepts the ChatDeepDive prop shape', () => {
    render(
      <LlmChatComposer
        readOnly
        chatInput={{
          value: 'train a churn model',
          onValueChange: NOOP,
          onKeyDown: NOOP,
          placeholder: 'Describe your goal…',
          placeholders: ['Describe your goal…'],
          disabled: false,
          isStreaming: false,
          onSend: NOOP,
          onStop: NOOP,
        }}
        modelConfig={{
          model: 'gpt-5.4',
          onModelChange: NOOP,
          modelOptions: MODEL_OPTIONS,
        }}
        reasoningConfig={{
          reasoningEffort: 'medium' as ReasoningEffort,
          onReasoningEffortChange: NOOP,
          reasoningOptions: REASONING_OPTIONS,
        }}
      />,
    );
    expect(true).toBe(true);
  });

  it('QuestionCards accepts the UploadView plan prop shape', () => {
    render(
      <QuestionCards
        questions={PLAN_QUESTIONS}
        onSubmit={NOOP}
        disabled={false}
      />,
    );
    expect(true).toBe(true);
  });

  it('NotebookCellOutput accepts the NotebookDeepDive describe() table prop shape', () => {
    // NotebookCellOutput uses Radix Tooltip, which requires a provider in
    // the tree. The real app wraps this at a higher level.
    render(
      <TooltipProvider>
        <NotebookCellOutput outputs={DESCRIBE_OUTPUTS} />
      </TooltipProvider>,
    );
    expect(true).toBe(true);
  });

  it('ComputeAnimation accepts its completed-state prop shape', () => {
    render(
      <ComputeAnimation
        files={DEMO_FILES}
        results={DEMO_RESULTS}
        isComplete={true}
        durationScale={0.75}
      />,
    );
    expect(true).toBe(true);
  });

  it('PdfViewer accepts its prop interface (real module is mocked)', () => {
    // Runtime render invokes the stub from the top-of-file `vi.mock`,
    // but TypeScript still resolves the prop types from the real
    // `frontend/src/components/data/PdfViewer.tsx`, so prop drift
    // (e.g. a renamed `url` field) still fails at compile time.
    render(
      <PdfViewer
        url="blob:mock-url"
        fileName="novacraft_business_context.pdf"
      />,
    );
    expect(true).toBe(true);
  });

  it('ToolIndicator accepts a minimal ToolCall + ToolResult pair', () => {
    render(
      <ToolIndicator
        toolCalls={TOOL_CALLS}
        results={TOOL_RESULTS}
        isRunning={false}
      />,
    );
    expect(true).toBe(true);
  });
});

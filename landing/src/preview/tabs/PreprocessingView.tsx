/**
 * PreprocessingView — app-preview Preprocessing tab rebuilt on REAL frontend
 * leaf components per landing design spec §5.5:
 *
 *   Custom split-pane: left = scrollable chat log with <LlmChatComposer> at
 *   bottom (static state, conversation rendered via <ToolIndicator> +
 *   <ToolResultRenderer>), right = notebook with static code cells +
 *   <NotebookCellOutput> cells.
 *
 * The entire view is read-only: the composer is mounted with `readOnly`, all
 * callbacks are no-ops, and the notebook cells are pre-rendered. Output
 * fixtures use the real `RichOutput` shape so `<NotebookCellOutput>` sees
 * exactly the same prop types as the live app.
 */

import { MoreHorizontal } from 'lucide-react';
import { LlmChatComposer } from '@frontend/components/llm/LlmChatComposer';
import type {
  AssistantModelOption,
  ReasoningEffort,
  ReasoningEffortOption,
} from '@frontend/components/llm/modelOptions';
import { ToolIndicator } from '@frontend/components/llm/ToolIndicator';
import { NotebookCellOutput } from '@frontend/components/notebook/NotebookCellOutput';
import { TooltipProvider } from '@frontend/components/ui/tooltip';
import {
  preprocessingChatTurns,
  type PreprocessingChatTurn,
} from '@/preview/fixtures/chats';
import {
  preprocessingNotebookCells,
  type PreprocessingNotebookCellFixture,
} from '@/preview/fixtures/notebooks';
import styles from './PreprocessingView.module.css';

// ---------------------------------------------------------------------------
// Composer config — static, read-only. Mirrors the real-app featured options.
// ---------------------------------------------------------------------------

const NOOP = () => {};

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
  {
    value: 'claude-4.5',
    label: 'Claude 4.5',
    kind: 'base',
    description: 'Anthropic flagship, strong at long-context reasoning.',
    supportedReasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
  },
];

const REASONING_OPTIONS: readonly ReasoningEffortOption[] = [
  { value: 'low',    label: 'Low',    icon: 'gauge' },
  { value: 'medium', label: 'Medium', icon: 'brain' },
  { value: 'high',   label: 'High',   icon: 'flame' },
  { value: 'xhigh',  label: 'Extra High', icon: 'rocket' },
];

// ---------------------------------------------------------------------------
// Left column — agentic chat log
// ---------------------------------------------------------------------------

function ChatTurn({ turn }: { turn: PreprocessingChatTurn }) {
  if (turn.role === 'user') {
    return (
      <div className={styles.userTurn}>
        <div className={styles.userBubble}>{turn.text}</div>
      </div>
    );
  }

  const hasTools = (turn.toolCalls?.length ?? 0) > 0;

  return (
    <div className={styles.assistantTurn}>
      {turn.text && <div className={styles.assistantText}>{turn.text}</div>}
      {hasTools && (
        <div className={styles.toolStrip}>
          <ToolIndicator
            toolCalls={turn.toolCalls ?? []}
            results={turn.toolResults ?? []}
            isRunning={false}
          />
        </div>
      )}
    </div>
  );
}

function ChatLog() {
  return (
    <div className={styles.chatLog} role="log" aria-label="Agentic chat log">
      {preprocessingChatTurns.map((turn) => (
        <ChatTurn key={turn.id} turn={turn} />
      ))}
    </div>
  );
}

function StaticComposer() {
  return (
    <div className={styles.composerWell}>
      <LlmChatComposer
        readOnly
        chatInput={{
          value: '',
          onValueChange: NOOP,
          onKeyDown: NOOP,
          placeholder: 'Ask a follow-up or @mention a column…',
          placeholders: [
            'Ask a follow-up or @mention a column…',
            'e.g. winsorize api_calls at the 99th percentile',
            'why did you drop 13 rows?',
          ],
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
          reasoningEffort: 'high' as ReasoningEffort,
          onReasoningEffortChange: NOOP,
          reasoningOptions: REASONING_OPTIONS,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right column — notebook cells with real <NotebookCellOutput>
// ---------------------------------------------------------------------------

function NotebookCell({ cell }: { cell: PreprocessingNotebookCellFixture }) {
  return (
    <article className={`${styles.cell} group`}>
      <header className={styles.cellHeader}>
        <span className={styles.cellExecCount}>In [{cell.executionIndex}]</span>
        <span className={styles.cellLanguageBadge}>python</span>
        <span className={styles.cellHeaderSpacer} />
        <span className={styles.cellKebab} aria-hidden="true">
          <MoreHorizontal size={14} />
        </span>
      </header>

      <div
        className={styles.cellCode}
        // Pre-baked Shiki github-dark HTML authored by us in the fixtures
        // module. Not user input — dangerouslySetInnerHTML is safe. See the
        // comment in notebooks.ts for the regeneration command.
        dangerouslySetInnerHTML={{ __html: cell.highlightedHtml }}
      />

      {/* `group` on the article enables the hover-reveal copy/collapse icons
       * inside <NotebookCellOutput>. The outputHost class scopes a few
       * Tailwind CSS variables so the reused component theme-matches the
       * landing preview without any frontend code changes. */}
      <div className={styles.outputHost}>
        <NotebookCellOutput outputs={cell.outputs} />
      </div>
    </article>
  );
}

function NotebookColumn() {
  return (
    <div className={styles.notebookColumn}>
      <div className={styles.notebookDatasetBadge}>
        <span>customers.csv</span>
        <span aria-hidden="true">·</span>
        <span>2,530 rows</span>
      </div>
      <div className={styles.notebookTitle}>Preprocessing notebook</div>
      {preprocessingNotebookCells.map((cell) => (
        <NotebookCell key={cell.id} cell={cell} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function PreprocessingView() {
  // `<NotebookCellOutput>` internally mounts Radix `<Tooltip>` primitives for
  // its copy/collapse controls. Radix tooltips require a surrounding provider
  // — the real app wires one at the layout root, but the landing preview
  // never mounts that layout, so we provide one locally here.
  return (
    <TooltipProvider>
      <div className={styles.root}>
        <section className={styles.chatColumn} aria-label="Agentic chat">
          <ChatLog />
          <StaticComposer />
        </section>
        <NotebookColumn />

      </div>
    </TooltipProvider>
  );
}

/**
 * TrainingView — rebuilt Training tab for the landing page app preview.
 *
 * Per landing design spec §5.5, this view composes three REAL frontend
 * leaf components:
 *
 *   1. <LlmChatComposer readOnly> — @frontend/components/llm/LlmChatComposer
 *   2. <ToolIndicator>             — @frontend/components/llm/ToolIndicator
 *   3. <NotebookCellOutput>        — @frontend/components/notebook/NotebookCellOutput
 *
 * plus two FROM-SCRATCH cards built inside landing/ because the real
 * training-progress + model-recommendation cards are tightly coupled to
 * execution state, project theme hooks, and Shadcn primitives that are
 * too heavy for a landing preview:
 *
 *   • <TrainingProgressCard> — 4 rows, Recharts sparklines, winner star
 *   • <ModelRecommendationCard> — champion summary + collapsible rationale
 *
 * Zero API calls. Zero WebSockets. Everything flows from static fixtures
 * in `@/preview/fixtures/{chats,notebooks,training}`.
 */

import { LlmChatComposer } from '@frontend/components/llm/LlmChatComposer';
import { ToolIndicator } from '@frontend/components/llm/ToolIndicator';
import { NotebookCellOutput } from '@frontend/components/notebook/NotebookCellOutput';
import { TooltipProvider } from '@frontend/components/ui/tooltip';
import type {
  AssistantModelOption,
  ReasoningEffort,
  ReasoningEffortOption,
} from '@frontend/components/llm/modelOptions';

import { trainingChatMessages, type TrainingChatTurn } from '@/preview/fixtures/chats';
import { trainingNotebookCells } from '@/preview/fixtures/notebooks';
import { trainingProgressSnapshot, modelRecommendation } from '@/preview/fixtures/training';
import { TrainingProgressCard } from '@/preview/components/TrainingProgressCard';
import { ModelRecommendationCard } from '@/preview/components/ModelRecommendationCard';

import styles from './TrainingView.module.css';

// ---------------------------------------------------------------------------
// Composer fixtures — same shape as the ChatDeepDive island so the composer
// renders identically to the rest of the landing page's real-component
// integrations. `readOnly` short-circuits the send action.
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
];

const REASONING_OPTIONS: readonly ReasoningEffortOption[] = [
  { value: 'low', label: 'Low', icon: 'gauge' },
  { value: 'medium', label: 'Medium', icon: 'brain' },
  { value: 'high', label: 'High', icon: 'flame' },
];

// ---------------------------------------------------------------------------
// Lightweight inline renderer for chat turns. We don't use the landing's
// `<ChatHistory>` helper because it expects the legacy `ChatMessage` shape
// with `ToolCallRow`s — we need the real `ToolCall`/`ToolResult` types so
// the embedded `<ToolIndicator>` can drive through `ToolResultRenderer`.
// ---------------------------------------------------------------------------

function ChatTurn({ turn }: { turn: TrainingChatTurn }) {
  const hasTools = (turn.toolCalls?.length ?? 0) > 0;
  // `turn.text` may contain lightweight markdown (bold + inline code) that
  // we render out directly as HTML fragments. Content is authored in-repo
  // so no sanitization is required.
  const html = turn.text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  return (
    <article className={styles.turn}>
      <div className={styles.turnAvatar} aria-hidden="true">
        {turn.role === 'user' ? 'U' : 'AI'}
      </div>
      <div className={styles.turnBody}>
        <p
          className={styles.turnText}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {hasTools && (
          <div className={styles.toolIndicatorHost}>
            <ToolIndicator
              toolCalls={turn.toolCalls ?? []}
              results={turn.toolResults ?? []}
              isRunning={false}
            />
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function TrainingView() {
  return (
    // NotebookCellOutput uses Radix Tooltip internally which needs a
    // `<TooltipProvider>` somewhere in its ancestry. The real app wraps it
    // at the shell level; the landing preview doesn't have a global
    // provider, so we scope one to this tab.
    <TooltipProvider delayDuration={150}>
      <div className={styles.root}>
        {/* ---------- Left: chat log + real LlmChatComposer ---------- */}
        <section className={styles.chatColumn} aria-label="Training chat">
          <div className={styles.chatScroll}>
            {trainingChatMessages.map((turn) => (
              <ChatTurn key={turn.id} turn={turn} />
            ))}
          </div>

          <div className={styles.composerHost}>
            <LlmChatComposer
              readOnly
              chatInput={{
                value: '',
                onValueChange: NOOP,
                onKeyDown: NOOP,
                placeholder: 'Ask about training…',
                placeholders: [
                  'Ask about training…',
                  'compare models',
                  'why this champion?',
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
        </section>

        {/* ---------- Right: notebook cells + progress + recommendation ---------- */}
        <section className={styles.rightColumn} aria-label="Training notebook and results">
          {trainingNotebookCells.map((cell) => {
            if (cell.kind === 'markdown') {
              return (
                <div key={cell.id} className={styles.cell}>
                  <div className={styles.cellMarkdown}>
                    <h3>{cell.source.replace(/^##\s*/, '')}</h3>
                  </div>
                </div>
              );
            }

            return (
              <div key={cell.id} className={`${styles.cell} group`}>
                <div className={styles.cellHeader}>
                  <span className={styles.cellHeaderDot} aria-hidden="true" />
                  PYTHON
                </div>
                <pre className={styles.cellCode}>{cell.source}</pre>
                {cell.outputs && cell.outputs.length > 0 && (
                  <NotebookCellOutput outputs={cell.outputs} />
                )}
              </div>
            );
          })}

          <TrainingProgressCard snapshot={trainingProgressSnapshot} />
          <ModelRecommendationCard recommendation={modelRecommendation} />
        </section>
      </div>
    </TooltipProvider>
  );
}

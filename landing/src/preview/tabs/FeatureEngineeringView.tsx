/**
 * Feature Engineering tab — rebuilt with real frontend leaf components
 * per landing spec §5.5:
 *
 *   Imports: LlmChatComposer, ToolIndicator, NotebookCellOutput.
 *   Fixtures: featureEngineeringChatTurns, featureEngineeringNotebookCells.
 *
 * No phase panels, no API calls, no Monaco, no Plotly. Styles live in a
 * dedicated CSS module so the sibling Preprocessing rebuild can safely edit
 * AgenticShell.module.css without stepping on us.
 */

import { useMemo, useState } from 'react';

import { LlmChatComposer } from '@frontend/components/llm/LlmChatComposer';
import { ToolIndicator } from '@frontend/components/llm/ToolIndicator';
import { NotebookCellOutput } from '@frontend/components/notebook/NotebookCellOutput';
import {
  type AssistantModelOption,
  type ReasoningEffort,
  type ReasoningEffortOption,
} from '@frontend/components/llm/modelOptions';
import { TooltipProvider } from '@frontend/components/ui/tooltip';

import {
  featureEngineeringChatTurns,
  type FeatureEngineeringChatTurn,
} from '@/preview/fixtures/chats';
import { featureEngineeringNotebookCells } from '@/preview/fixtures/notebooks';

import styles from './FeatureEngineeringView.module.css';

// ─── Real composer config (read-only landing demo) ────────────────────────
// Mirrors `buildInlineModelOptions` output in the real app so the model-bar
// shows authentic entries. We intentionally keep this local to the view
// instead of exporting a shared helper — per task instructions, common
// composer setup will be extracted once the sibling tabs land.

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
    description:
      'Use for most everyday tasks with strong quality at lower cost.',
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
] as const;

const REASONING_OPTIONS: readonly ReasoningEffortOption[] = [
  { value: 'low', label: 'Low', icon: 'gauge' },
  { value: 'medium', label: 'Medium', icon: 'brain' },
  { value: 'high', label: 'High', icon: 'flame' },
  { value: 'xhigh', label: 'Extra High', icon: 'rocket' },
] as const;

const COMPOSER_PLACEHOLDERS = [
  'Propose a new feature…',
  'e.g. encode plan_tier',
  'Ask about a transform',
];

// ─── Individual chat turn row ────────────────────────────────────────────

function ChatTurn({ turn }: { turn: FeatureEngineeringChatTurn }) {
  const isUser = turn.role === 'user';
  const toolCalls = turn.toolCalls ?? [];
  const toolResults = turn.toolResults ?? [];
  const hasTools = toolCalls.length > 0;

  return (
    <div className={styles.turn}>
      {turn.text ? (
        <div className={styles.bubble}>
          <div
            className={`${styles.avatar}${isUser ? ` ${styles.avatarUser}` : ''}`}
            aria-hidden="true"
          >
            {isUser ? 'YOU' : 'AI'}
          </div>
          <div className={styles.bubbleBody}>{turn.text}</div>
        </div>
      ) : null}

      {hasTools ? (
        <div className={styles.toolStrip}>
          <ToolIndicator
            toolCalls={toolCalls}
            results={toolResults}
            isRunning={false}
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── The view ────────────────────────────────────────────────────────────

export function FeatureEngineeringView() {
  // The composer is fully controlled and intentionally locked into a
  // prefilled, read-only state so it reads as "the last thing the user typed
  // before the agent started working". `readOnly` short-circuits onSend and
  // the store mutators are no-ops — no demo fetches, no state leakage.
  const [composerValue, setComposerValue] = useState(
    "encode plan_tier, add temporal features from signup_dt, and a revenue-per-call ratio",
  );
  const [model, setModel] = useState('gpt-5.4');
  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>('high');

  const turns = useMemo(() => featureEngineeringChatTurns, []);
  const cells = useMemo(() => featureEngineeringNotebookCells, []);

  return (
    <TooltipProvider>
      <div className={styles.root}>
        {/* ── Left: chat log + real composer ── */}
        <section className={styles.chatColumn} aria-label="Agent chat log">
          <div className={styles.chatScroll}>
            {turns.map((turn) => (
              <ChatTurn key={turn.id} turn={turn} />
            ))}
          </div>

          <div className={styles.composerWrap}>
            <LlmChatComposer
              chatInput={{
                value: composerValue,
                onValueChange: setComposerValue,
                onKeyDown: () => undefined,
                placeholder: 'Propose a new feature…',
                placeholders: COMPOSER_PLACEHOLDERS,
                disabled: false,
                isStreaming: false,
                onSend: () => undefined,
                onStop: () => undefined,
              }}
              modelConfig={{
                model,
                onModelChange: setModel,
                modelOptions: MODEL_OPTIONS,
              }}
              reasoningConfig={{
                reasoningEffort,
                onReasoningEffortChange: setReasoningEffort,
                reasoningOptions: REASONING_OPTIONS,
              }}
              readOnly
            />
          </div>
        </section>

        {/* ── Right: notebook with real NotebookCellOutput ── */}
        <section className={styles.notebookColumn} aria-label="Feature engineering notebook">
          <div className={styles.notebookHeader}>NOTEBOOK · FEATURE ENGINEERING</div>
          {cells.map((cell) =>
            cell.kind === 'markdown' ? (
              <div key={cell.id} className={`${styles.cell} ${styles.cellMarkdown}`}>
                <h3>{cell.source.replace(/^#+\s*/, '')}</h3>
              </div>
            ) : (
              <div key={cell.id} className={`${styles.cell} group`}>
                <pre className={styles.cellCode}>{cell.source}</pre>
                {cell.outputs && cell.outputs.length > 0 ? (
                  <div className={styles.outputWrap}>
                    <NotebookCellOutput outputs={cell.outputs} />
                  </div>
                ) : null}
              </div>
            ),
          )}
        </section>
      </div>
    </TooltipProvider>
  );
}

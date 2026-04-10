import { useEffect, useState } from 'react';
import { LlmChatComposer } from '@frontend/components/llm/LlmChatComposer';
import type {
  AssistantModelOption,
  ReasoningEffort,
  ReasoningEffortOption,
} from '@frontend/components/llm/modelOptions';
import { Check, MousePointer2 } from 'lucide-react';
import DeepDive from '@/components/DeepDive';
import { cn } from '@/lib/cn';
import styles from './ChatDeepDive.module.css';

const DYNAMIC_PLACEHOLDERS = [
  'Describe your goal…',
  'e.g. predict churn',
  'ask about a column',
];

const SCRIPTED_TRANSCRIPTION =
  'train a churn model and tell me which features matter';

const TOOL_CALLS = [
  { id: 't1', label: 'Read dataset',       hint: 'customers.csv · 2,530 rows' },
  { id: 't2', label: 'Profile columns',    hint: '14 columns · 4 issues found' },
  { id: 't3', label: 'Propose transforms', hint: '5 imputations + 1 drop' },
  { id: 't4', label: 'Create plan',        hint: '5-step training plan ready' },
];

// Minimal demo fixtures matching the real frontend types. These are never
// actually interactive — the composer is mounted in readOnly mode.
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
];

const NOOP = () => {};

function ChatDeepDiveVisual() {
  const [value, setValue] = useState('');
  const [showCursor, setShowCursor] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(false);

  useEffect(() => {
    // Scripted sequence — kicks off shortly after mount. Honors reduced
    // motion by skipping the typing animation and jumping straight to the
    // final state so the composer still reads as filled in.
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setValue(SCRIPTED_TRANSCRIPTION);
      setToolsVisible(true);
      return;
    }

    let typingInterval: ReturnType<typeof setInterval> | null = null;
    let finalTimer: ReturnType<typeof setTimeout> | null = null;

    const cursorTimer = setTimeout(() => {
      setShowCursor(true);
    }, 800);

    const typingTimer = setTimeout(() => {
      let i = 0;
      typingInterval = setInterval(() => {
        if (i >= SCRIPTED_TRANSCRIPTION.length) {
          if (typingInterval) clearInterval(typingInterval);
          finalTimer = setTimeout(() => setToolsVisible(true), 500);
          return;
        }
        i += 1;
        setValue(SCRIPTED_TRANSCRIPTION.slice(0, i));
      }, 45);
    }, 1800);

    return () => {
      clearTimeout(cursorTimer);
      clearTimeout(typingTimer);
      if (typingInterval) clearInterval(typingInterval);
      if (finalTimer) clearTimeout(finalTimer);
    };
  }, []);

  return (
    <div className={styles.root}>
      <LlmChatComposer
        readOnly
        chatInput={{
          value,
          onValueChange: setValue,
          onKeyDown: NOOP,
          placeholder: 'Describe your goal…',
          placeholders: DYNAMIC_PLACEHOLDERS,
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
      />

      {showCursor && (
        <MousePointer2
          className={styles.cursorSprite}
          aria-hidden="true"
          size={14}
        />
      )}

      <div
        className={cn(styles.toolRows, toolsVisible && styles.toolRowsVisible)}
        aria-live="polite"
      >
        {TOOL_CALLS.map((t, i) => (
          <div
            key={t.id}
            className={styles.toolRow}
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <Check
              size={13}
              className={styles.toolRowCheck}
              aria-hidden="true"
            />
            <span className={styles.toolRowLabel}>{t.label}</span>
            <span className={styles.toolRowHint}>{t.hint}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Deep-dive 1 — CHAT. Wraps the shared {@link DeepDive} frame with the CHAT
 * copy from section 4.5 of the landing-page spec and mounts the real
 * frontend `<LlmChatComposer readOnly>` inside as a live island. A scripted
 * IO-enter sequence (cursor glide → mock transcription → tool-call reveal)
 * demonstrates the chat experience without any backend wiring.
 */
export default function ChatDeepDive() {
  return (
    <DeepDive
      id="chat"
      eyebrow="01 — CHAT"
      headlineBright="Talk to your data like a colleague."
      headlineMuted="Voice, text, or keyboard — the agent understands."
      body="Ask in plain English. Watch tool calls stream in real time as the agent reads your tables, proposes transformations, and explains its reasoning."
      kbdLabel="to open chat in any tab"
      kbdBadge="⌘K"
    >
      <ChatDeepDiveVisual />
    </DeepDive>
  );
}

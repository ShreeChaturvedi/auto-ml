import { useEffect, useState } from 'react';
import { LlmChatComposer } from '@frontend/components/llm/LlmChatComposer';
import type {
  AssistantModelOption,
  ReasoningEffort,
  ReasoningEffortOption,
} from '@frontend/components/llm/modelOptions';
import { Check, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
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

/**
 * Phases of the scripted deep-dive animation. They run in order:
 *   idle → cursor-glide → cursor-click → typing → tools → done
 * Under reduced motion the component mounts directly at `done`.
 */
type Phase =
  | 'idle'
  | 'cursor-glide'
  | 'cursor-click'
  | 'typing'
  | 'tools'
  | 'done';

const TYPING_INTERVAL_MS = 45;

function ChatDeepDiveVisual() {
  // Reactive hook so toggling OS reduced-motion mid-session is respected.
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>(() => (reduced ? 'done' : 'idle'));
  const [typedValue, setTypedValue] = useState<string>(() =>
    reduced ? SCRIPTED_TRANSCRIPTION : '',
  );

  // Drive discrete phase transitions via setTimeout. The typing interval is
  // scoped to the typing phase so a single cleanup clears everything on
  // unmount or when reduced-motion toggles. All state transitions are
  // deferred (setTimeout) to avoid synchronous setState inside the effect.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let typingInterval: ReturnType<typeof setInterval> | null = null;

    if (reduced) {
      // Jump to the final frame on the next tick (deferred to avoid a
      // synchronous setState cascade inside the effect body).
      timers.push(
        setTimeout(() => {
          setPhase('done');
          setTypedValue(SCRIPTED_TRANSCRIPTION);
        }, 0),
      );
      return () => {
        for (const t of timers) clearTimeout(t);
      };
    }

    // Re-seed idle on the next tick so the sprite mounts at `.cursorSpriteStart`
    // (invisible, off-screen). If reduced-motion flipped off mid-session the
    // initial useState seed may be stale.
    timers.push(
      setTimeout(() => {
        setPhase('idle');
        setTypedValue('');
      }, 0),
    );
    // t=200ms   cursor enters and begins gliding toward voice button
    timers.push(setTimeout(() => setPhase('cursor-glide'), 200));
    // t=800ms   cursor "clicks" the voice button (scale pulse + fade)
    timers.push(setTimeout(() => setPhase('cursor-click'), 800));
    // t=900ms   transcription typing begins
    timers.push(
      setTimeout(() => {
        setPhase('typing');
        let i = 0;
        typingInterval = setInterval(() => {
          i += 1;
          setTypedValue(SCRIPTED_TRANSCRIPTION.slice(0, i));
          if (i >= SCRIPTED_TRANSCRIPTION.length && typingInterval) {
            clearInterval(typingInterval);
            typingInterval = null;
            // Short beat, then tool rows cascade in.
            timers.push(setTimeout(() => setPhase('tools'), 500));
            timers.push(setTimeout(() => setPhase('done'), 1500));
          }
        }, TYPING_INTERVAL_MS);
      }, 900),
    );

    return () => {
      for (const t of timers) clearTimeout(t);
      if (typingInterval) clearInterval(typingInterval);
    };
  }, [reduced]);

  // Derive visible state from the single phase discriminator. The sprite is
  // mounted during idle (invisible, pre-glide) so the CSS transition from
  // `cursorSpriteStart` → `cursorSpriteGlided` actually animates the
  // transform instead of snapping to the final frame.
  const renderCursor =
    !reduced &&
    (phase === 'idle' ||
      phase === 'cursor-glide' ||
      phase === 'cursor-click');
  const toolsVisible = phase === 'tools' || phase === 'done';
  const value =
    phase === 'typing'
      ? typedValue
      : phase === 'tools' || phase === 'done'
        ? SCRIPTED_TRANSCRIPTION
        : '';

  return (
    <div className={styles.root}>
      <LlmChatComposer
        readOnly
        chatInput={{
          value,
          onValueChange: NOOP,
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

      {renderCursor && (
        <MousePointer2
          className={cn(
            styles.cursorSprite,
            phase === 'idle' && styles.cursorSpriteStart,
            phase === 'cursor-glide' && styles.cursorSpriteGlided,
            phase === 'cursor-click' && styles.cursorSpriteClick,
          )}
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
 * Deep-dive 1 — CHAT visual. Mounts the real frontend `<LlmChatComposer
 * readOnly>` as a live island inside a scripted IO-enter sequence (cursor
 * glide → mock transcription → tool-call reveal). The shared `<DeepDive>`
 * chrome (eyebrow, headline, body, kbd hint) is composed around this by
 * `FeaturesSection.astro` — this component renders only the right-hand
 * visual content.
 */
export default function ChatDeepDive() {
  return <ChatDeepDiveVisual />;
}

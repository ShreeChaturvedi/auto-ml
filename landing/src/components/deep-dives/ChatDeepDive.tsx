import { useEffect, useRef, useState } from 'react';
import { LlmChatComposer } from '@frontend/components/llm/LlmChatComposer';
import { ToolIndicator } from '@frontend/components/llm/ToolIndicator';
import type { MentionInputHandle } from '@frontend/components/llm/MentionInput';
import type {
  AssistantModelOption,
  ReasoningEffort,
  ReasoningEffortOption,
} from '@frontend/components/llm/modelOptions';
import type { ToolCall, ToolResult } from '@frontend/types/llmUi';
import { Mic, MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import styles from './ChatDeepDive.module.css';

// -----------------------------------------------------------------------------
// Static demo fixtures
// -----------------------------------------------------------------------------

const DYNAMIC_PLACEHOLDERS = [
  'Describe your goal…',
  'e.g. predict churn',
  'ask about a column',
];

const SCRIPTED_TRANSCRIPTION =
  'train a churn model and tell me which features matter';

const TYPING_INTERVAL_MS = 25;

/**
 * Four real ToolCalls mapped to the spec's label sequence. These reuse the
 * canonical `getToolLabel` tense-based rendering from ToolDisplayHelpers so
 * the strip reads as real streaming tool-call rows ("Reading dataset
 * profile" → "Read dataset profile for customers.csv") rather than mock
 * HTML. Args/output shapes match what the real tool-display helpers expect
 * so `getResultHint` can surface the row/col hint on completion.
 */
const TOOL_CALL_FIXTURES: ToolCall[] = [
  { id: 'tc-read',    tool: 'get_dataset_sample',         args: { limit: 50 } },
  { id: 'tc-profile', tool: 'get_dataset_profile',        args: {} },
  { id: 'tc-propose', tool: 'propose_transformation_step', args: { title: 'column transforms' } },
  { id: 'tc-plan',    tool: 'propose_transformation_step', args: { title: 'training plan' } },
];

const TOOL_RESULT_FIXTURES: Record<string, ToolResult> = {
  'tc-read': {
    id: 'tc-read',
    tool: 'get_dataset_sample',
    output: { filename: 'customers.csv', sample: Array.from({ length: 50 }) },
  },
  'tc-profile': {
    id: 'tc-profile',
    tool: 'get_dataset_profile',
    output: { filename: 'customers.csv', nRows: 2530, nCols: 14 },
  },
  'tc-propose': {
    id: 'tc-propose',
    tool: 'propose_transformation_step',
    output: { stepId: 'step-01' },
  },
  'tc-plan': {
    id: 'tc-plan',
    tool: 'propose_transformation_step',
    output: { stepId: 'step-plan' },
  },
};

// Minimal model + reasoning fixtures mirroring the real frontend types.
// These are never actually interactive — the composer is in `readOnly` mode.
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
  { value: 'low',    label: 'Low',    icon: 'gauge' },
  { value: 'medium', label: 'Medium', icon: 'brain' },
  { value: 'high',   label: 'High',   icon: 'flame' },
];

const NOOP = () => {};
const EMPTY_MENTIONS = new Set<string>();
const EMPTY_MENTION_TYPES = new Map<string, string>();

// -----------------------------------------------------------------------------
// Timeline
// -----------------------------------------------------------------------------

/**
 * Scripted phases played in sequence after IO-enter. The timing matches
 * the spec §4.5 micro-sequence:
 *   t=0     idle             — placeholder cycles (MentionInput's real
 *                               `useAnimatedPlaceholder` animation)
 *   t=2000  cursor-glide     — CSS cursor sprite glides to voice button
 *   t=2800  cursor-click     — click pulse on voice button
 *   t=3000  typing           — character-by-character mock transcription
 *   t≈4350  send-pulse       — send button pulses once
 *   t≈4800  tools-streaming  — ToolIndicator fades in with running tools
 *   t=6000+ tools-completing — tools mark done one-by-one (500ms apart)
 *   t≈8000  done             — final steady state
 */
type Phase =
  | 'idle'
  | 'cursor-glide'
  | 'cursor-click'
  | 'typing'
  | 'send-pulse'
  | 'tools-streaming'
  | 'done';

function ChatDeepDiveVisual() {
  const reduced = usePrefersReducedMotion();

  // Timeline / scripted-sequence state.
  const [phase, setPhase] = useState<Phase>(() => (reduced ? 'done' : 'idle'));
  const [typedValue, setTypedValue] = useState<string>(() =>
    reduced ? SCRIPTED_TRANSCRIPTION : '',
  );
  // Number of tool calls whose result has been "completed" — grows from 0 → 4
  // as each row flips from running to done after the strip appears.
  const [completedCount, setCompletedCount] = useState<number>(() =>
    reduced ? TOOL_CALL_FIXTURES.length : 0,
  );

  // Cursor-sprite target position (pixels, relative to .root) — computed
  // lazily from the real voice-button DOM node so the sprite actually lands
  // on the button regardless of composer layout changes.
  const [cursorTarget, setCursorTarget] = useState<{ x: number; y: number } | null>(null);

  // Refs
  const rootRef = useRef<HTMLDivElement | null>(null);
  const voiceButtonRef = useRef<HTMLButtonElement | null>(null);
  const mentionInputRef = useRef<MentionInputHandle | null>(null);
  const hasPlayedRef = useRef<boolean>(false);

  // Compute cursor target from the rendered voice button's bounding rect.
  // Runs once the refs are attached and again on window resize so the glide
  // end-point tracks the real button.
  useEffect(() => {
    if (reduced) return;
    const computeTarget = () => {
      const root = rootRef.current;
      const button = voiceButtonRef.current;
      if (!root || !button) return;
      const rootRect = root.getBoundingClientRect();
      const btnRect = button.getBoundingClientRect();
      setCursorTarget({
        x: btnRect.left - rootRect.left + btnRect.width / 2,
        y: btnRect.top - rootRect.top + btnRect.height / 2,
      });
    };
    computeTarget();
    // Recompute after a tick in case the composer's async measurements
    // (ResizeObserver, MentionInput hydration) shift the layout.
    const t = setTimeout(computeTarget, 50);
    window.addEventListener('resize', computeTarget);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', computeTarget);
    };
  }, [reduced]);

  // IntersectionObserver: play the scripted timeline once when the
  // component first enters the viewport. Scrolling away + back does NOT
  // replay — `hasPlayedRef` latches it.
  useEffect(() => {
    if (reduced) return;
    const root = rootRef.current;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let typingInterval: ReturnType<typeof setInterval> | null = null;

    const runTimeline = () => {
      // t=2000ms   cursor begins gliding toward voice button
      timers.push(setTimeout(() => setPhase('cursor-glide'), 2000));
      // t=2800ms   cursor "clicks" the voice button
      timers.push(setTimeout(() => setPhase('cursor-click'), 2800));
      // t=3000ms   character-by-character transcription begins
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
              // t≈4350ms   send button pulses once
              timers.push(setTimeout(() => setPhase('send-pulse'), 0));
              // t≈4800ms   tool strip fades in, all 4 running
              timers.push(setTimeout(() => setPhase('tools-streaming'), 450));
              // t=6000ms+  mark each tool done 500ms apart
              for (let k = 0; k < TOOL_CALL_FIXTURES.length; k += 1) {
                timers.push(
                  setTimeout(
                    () => setCompletedCount((c) => Math.max(c, k + 1)),
                    1200 + k * 500,
                  ),
                );
              }
              // t≈8000ms   final steady state
              timers.push(
                setTimeout(
                  () => setPhase('done'),
                  1200 + TOOL_CALL_FIXTURES.length * 500 + 200,
                ),
              );
            }
          }, TYPING_INTERVAL_MS);
        }, 3000),
      );
    };

    if (!root || typeof IntersectionObserver === 'undefined') {
      // Fallback (SSR-less tests, older jsdom): play immediately.
      if (!hasPlayedRef.current) {
        hasPlayedRef.current = true;
        runTimeline();
      }
      return () => {
        for (const t of timers) clearTimeout(t);
        if (typingInterval) clearInterval(typingInterval);
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasPlayedRef.current) {
            hasPlayedRef.current = true;
            runTimeline();
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.35 },
    );
    io.observe(root);

    return () => {
      io.disconnect();
      for (const t of timers) clearTimeout(t);
      if (typingInterval) clearInterval(typingInterval);
    };
  }, [reduced]);

  // -------------------------------------------------------------------------
  // Derived render state
  // -------------------------------------------------------------------------

  const composerValue =
    phase === 'typing'
      ? typedValue
      : phase === 'send-pulse' ||
          phase === 'tools-streaming' ||
          phase === 'done'
        ? SCRIPTED_TRANSCRIPTION
        : '';

  // Tool strip visible from the streaming phase onward.
  const toolsVisible = phase === 'tools-streaming' || phase === 'done';
  // `isRunning` stays true while any call is still in flight so pending rows
  // get the shimmer + spinner treatment from ToolIndicator.
  const isRunning = completedCount < TOOL_CALL_FIXTURES.length;
  // Slice of tool calls whose results are currently attached — each flips
  // running → done independently via the `completedCount` counter.
  const visibleResults: ToolResult[] = TOOL_CALL_FIXTURES.slice(0, completedCount).map(
    (call) => TOOL_RESULT_FIXTURES[call.id],
  );

  // Render the cursor sprite until the click pulse finishes.
  const renderCursor =
    !reduced &&
    (phase === 'idle' ||
      phase === 'cursor-glide' ||
      phase === 'cursor-click');

  const cursorStyle: React.CSSProperties =
    phase === 'cursor-glide' || phase === 'cursor-click'
      ? cursorTarget
        ? { left: `${cursorTarget.x}px`, top: `${cursorTarget.y}px` }
        : {}
      : {};

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={rootRef}
      className={cn(
        styles.root,
        phase === 'send-pulse' && styles.rootSendPulse,
      )}
    >
      <LlmChatComposer
        readOnly
        chatInput={{
          value: composerValue,
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
        slots={{
          // Wiring a mentionSlot enables the real animated placeholder
          // cycling inside MentionInput (reuses `useAnimatedPlaceholder`).
          mentionSlot: {
            dropdown: null,
            inputRef: mentionInputRef,
            mentionNames: EMPTY_MENTIONS,
            mentionTypes: EMPTY_MENTION_TYPES,
            onValueChange: NOOP,
          },
          // Static mock voice button — the cursor sprite targets this
          // real DOM node via `voiceButtonRef` so its glide end-point
          // always aligns with the rendered button.
          voiceSlot: (
            <button
              ref={voiceButtonRef}
              type="button"
              aria-label="Voice input (demo)"
              tabIndex={-1}
              className={cn(
                styles.voiceButton,
                phase === 'cursor-click' && styles.voiceButtonClicked,
              )}
            >
              <Mic className={styles.voiceIcon} aria-hidden="true" />
            </button>
          ),
        }}
      />

      {toolsVisible && (
        <div className={styles.toolsStrip} aria-live="polite">
          <ToolIndicator
            toolCalls={TOOL_CALL_FIXTURES}
            results={visibleResults}
            isRunning={isRunning}
          />
        </div>
      )}

      {renderCursor && (
        <MousePointer2
          className={cn(
            styles.cursorSprite,
            phase === 'idle' && styles.cursorSpriteStart,
            phase === 'cursor-glide' && styles.cursorSpriteGlided,
            phase === 'cursor-click' && styles.cursorSpriteClick,
          )}
          style={cursorStyle}
          aria-hidden="true"
          size={16}
        />
      )}
    </div>
  );
}

/**
 * Deep-dive 1 — CHAT visual. Mounts the real frontend `<LlmChatComposer
 * readOnly>` + `<ToolIndicator>` as a live island inside a scripted
 * IO-enter sequence (cursor glide → mock transcription → send pulse →
 * tool-call reveal). The shared `<DeepDive>` chrome (eyebrow, headline,
 * body, kbd hint) is composed around this by `FeaturesSection.astro` —
 * this component renders only the right-hand visual content.
 */
export default function ChatDeepDive() {
  return <ChatDeepDiveVisual />;
}

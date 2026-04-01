import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent
} from 'react';
import { MentionInputDecorations } from '@/components/llm/MentionInputDecorations';
import {
  buildMentionInputDOM,
  clearMentionInputContent,
  collapseMentionInputAnimationSpans,
  getMentionInputCursorPos,
  placeMentionInputCursorAt,
  serializeMentionInputDOM,
  VOICE_CHAR_ANIM_MS,
  VOICE_CHAR_STAGGER_MS,
  type AnimateCharRange,
} from '@/components/llm/mentionInputDom';
import { useAnimatedPlaceholder } from '@/components/ui/useAnimatedPlaceholder';
import { cn } from '@/lib/utils';

export type { AnimateCharRange } from '@/components/llm/mentionInputDom';

export interface MentionInputHandle {
  insertMention(name: string): void;
  focus(): void;
  element(): HTMLDivElement | null;
  getSelectionOffset(): number;
  syncValue(value: string, cursorOffset?: number, animateRange?: AnimateCharRange): void;
}

interface MentionInputProps {
  value: string;
  onValueChange: (value: string, cursorPos?: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  mentionNames: Set<string>;
  /** Map from lowercase filename → file type (csv, json, etc.) for chip coloring */
  mentionTypes?: Map<string, string>;
  /** Resolved CSS color string for the voice-input caret */
  themeColor?: string;
  placeholder?: string;
  /** Animated cycling placeholders — takes precedence over placeholder when non-empty */
  placeholders?: string[];
  disabled?: boolean;
  voiceActive?: boolean;
  className?: string;
}

function scheduleAnimationCleanup(
  root: HTMLElement,
  timerRef: { current: ReturnType<typeof setTimeout> | null }
): void {
  const spans = root.querySelectorAll<HTMLElement>('[data-voice-anim]');
  if (spans.length === 0) return;

  const lastSpan = spans[spans.length - 1];
  const delay = parseFloat(lastSpan.style.animationDelay || '0');
  const totalTime = delay + VOICE_CHAR_ANIM_MS + 50;

  timerRef.current = setTimeout(() => {
    const isFocused = document.activeElement === root;
    const savedPos = isFocused ? getMentionInputCursorPos(root) : -1;

    collapseMentionInputAnimationSpans(root);

    if (savedPos >= 0) {
      placeMentionInputCursorAt(root, savedPos);
    }

    timerRef.current = null;
  }, totalTime);
}

export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(
  function MentionInput(
    { value, onValueChange, onKeyDown, mentionNames, mentionTypes, themeColor, placeholder, placeholders, disabled, voiceActive, className },
    ref
  ) {
    const divRef = useRef<HTMLDivElement>(null);
    const lastValueRef = useRef(value);
    const composingRef = useRef(false);
    const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cursorRafRef = useRef(0);

    const hasAnimatedPlaceholders = !voiceActive && !!(placeholders && placeholders.length > 1);
    const animState = useAnimatedPlaceholder({
      placeholders: hasAnimatedPlaceholders ? placeholders : [''],
      interval: 4000,
      value: value || '',
      disabled: !!disabled,
    });

    const syncRenderedValue = useCallback((nextValue: string, cursorOffset?: number, animateRange?: AnimateCharRange) => {
      const el = divRef.current;
      if (!el) return;

      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
      cancelAnimationFrame(cursorRafRef.current);
      collapseMentionInputAnimationSpans(el);

      lastValueRef.current = nextValue;
      if (nextValue) {
        clearMentionInputContent(el);
        el.appendChild(buildMentionInputDOM(nextValue, mentionNames, mentionTypes, animateRange));
      } else {
        clearMentionInputContent(el);
      }

      if (cursorOffset !== undefined && !disabled) {
        if (document.activeElement !== el) {
          el.focus();
        }

        if (animateRange && animateRange.end > animateRange.start) {
          const totalNewChars = animateRange.end - animateRange.start;
          placeMentionInputCursorAt(el, animateRange.start);
          const startTime = performance.now();

          const tick = () => {
            if (document.activeElement !== el) return;
            const elapsed = performance.now() - startTime;
            const charsRevealed = Math.min(
              Math.floor(elapsed / VOICE_CHAR_STAGGER_MS) + 1,
              totalNewChars
            );
            placeMentionInputCursorAt(el, animateRange.start + charsRevealed);
            if (charsRevealed < totalNewChars) {
              cursorRafRef.current = requestAnimationFrame(tick);
            }
          };

          cursorRafRef.current = requestAnimationFrame(tick);
        } else {
          placeMentionInputCursorAt(el, cursorOffset);
        }
      }

      if (animateRange) {
        scheduleAnimationCleanup(el, cleanupTimerRef);
      }
    }, [disabled, mentionNames, mentionTypes]);

    useEffect(() => {
      return () => {
        if (cleanupTimerRef.current) {
          clearTimeout(cleanupTimerRef.current);
        }
        cancelAnimationFrame(cursorRafRef.current);
      };
    }, []);

    useImperativeHandle(ref, () => ({
      insertMention(name: string) {
        const el = divRef.current;
        if (!el) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const cursorPos = getMentionInputCursorPos(el);
        const serialized = serializeMentionInputDOM(el);
        const beforeCursor = serialized.slice(0, cursorPos);
        const atIndex = beforeCursor.lastIndexOf('@');
        if (atIndex === -1) return;

        const replacement = `@${name} `;
        const newValue = serialized.slice(0, atIndex) + replacement + serialized.slice(cursorPos);

        const targetOffset = atIndex + replacement.length;
        syncRenderedValue(newValue, targetOffset);
        onValueChange(newValue, targetOffset);
      },
      focus() {
        const el = divRef.current;
        if (!el) return;

        el.focus();
        placeMentionInputCursorAt(el, serializeMentionInputDOM(el).length);
      },
      element() {
        return divRef.current;
      },
      getSelectionOffset() {
        const el = divRef.current;
        if (!el) {
          return 0;
        }

        if (document.activeElement !== el) {
          return lastValueRef.current.length;
        }

        return getMentionInputCursorPos(el);
      },
      syncValue(nextValue: string, cursorOffset?: number, animateRange?: AnimateCharRange) {
        syncRenderedValue(nextValue, cursorOffset, animateRange);
      },
    }), [onValueChange, syncRenderedValue]);

    // Sync DOM from external value changes (e.g. clearing after send)
    useEffect(() => {
      const el = divRef.current;
      if (!el) return;

      if (value !== lastValueRef.current) {
        const shouldPreserveSelection = document.activeElement === el;
        const nextCursorOffset = shouldPreserveSelection
          ? Math.min(getMentionInputCursorPos(el), value.length)
          : undefined;
        syncRenderedValue(value, nextCursorOffset);
      }
    }, [syncRenderedValue, value]);

    const handleInput = useCallback(() => {
      if (composingRef.current) return;
      const el = divRef.current;
      if (!el) return;

      collapseMentionInputAnimationSpans(el);

      const serialized = serializeMentionInputDOM(el);
      const normalizedValue = serialized === '\n' ? '' : serialized;
      const cursorPos = normalizedValue ? getMentionInputCursorPos(el) : 0;

      if (!normalizedValue) {
        clearMentionInputContent(el);
      }

      if (normalizedValue !== lastValueRef.current) {
        lastValueRef.current = normalizedValue;
        onValueChange(normalizedValue, cursorPos);
      }
    }, [onValueChange]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }, []);

    const handleCompositionStart = useCallback(() => {
      composingRef.current = true;
    }, []);

    const handleCompositionEnd = useCallback(() => {
      composingRef.current = false;
      handleInput();
    }, [handleInput]);

    const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Tab' && !e.shiftKey && !value && hasAnimatedPlaceholders && animState.currentPlaceholder) {
        e.preventDefault();
        const ph = animState.currentPlaceholder;
        syncRenderedValue(ph, ph.length);
        onValueChange(ph, ph.length);
        return;
      }
      onKeyDown(e);
    }, [value, hasAnimatedPlaceholders, animState.currentPlaceholder, syncRenderedValue, onValueChange, onKeyDown]);

    return (
      <div
        className={cn(
          'relative min-h-16 w-full flex-1',
          className
        )}
        style={themeColor ? { '--voice-theme-color': themeColor } as CSSProperties : undefined}
      >
        <MentionInputDecorations
          value={value}
          placeholder={placeholder}
          placeholders={placeholders}
          voiceActive={voiceActive}
          hasAnimatedPlaceholders={hasAnimatedPlaceholders}
          animState={animState}
        />

        <div
          ref={divRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          data-slot="input-group-control"
          data-empty={value.length === 0 ? 'true' : 'false'}
          role="textbox"
          aria-label="Message input"
          aria-disabled={disabled}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className={cn(
            'border-input focus-visible:border-ring focus-visible:ring-ring/50',
            // IMPORTANT: NO `flex` here — must be block so inline chips don't stretch
            'min-h-16 w-full resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none outline-none transition-[color,box-shadow] focus-visible:ring-0',
            'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-transparent',
            'whitespace-pre-wrap break-words'
          )}
          style={
            voiceActive
              ? value.length === 0
                ? { caretColor: 'transparent' }
                : { caretColor: 'var(--voice-theme-color, hsl(var(--primary)))' }
              : undefined
          }
        />
      </div>
    );
  }
);

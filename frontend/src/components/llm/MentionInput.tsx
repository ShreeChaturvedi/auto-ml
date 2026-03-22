import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent
} from 'react';
import { cn } from '@/lib/utils';
import { fileIconColorByType, tailwindColorToHex } from '@/lib/fileUtils';
import type { FileType } from '@/types/file';
import {
  useAnimatedPlaceholder,
  CHAR_ANIM_DURATION_MS,
  CHAR_STAGGER_MS
} from '@/components/ui/useAnimatedPlaceholder';

export interface AnimateCharRange { start: number; end: number }

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

const VOICE_CHAR_STAGGER_MS = 14;
const VOICE_CHAR_ANIM_MS = 180;

function AnimatedMentionPlaceholder({ placeholders }: { placeholders: string[] }) {
  const anim = useAnimatedPlaceholder({
    placeholders,
    interval: 4000,
    value: '',
    disabled: false,
  });

  return (
    <div className="pointer-events-none absolute inset-x-3 top-2.5 overflow-hidden" aria-hidden="true">
      <div className="relative overflow-hidden">
        <span
          className="block text-base text-muted-foreground md:text-sm whitespace-pre-wrap break-words"
          style={{
            transform: anim.isAnimating ? 'translateY(-100%)' : 'translateY(0)',
            opacity: anim.isAnimating ? 0 : 1,
            transition: anim.outgoingTransition,
          }}
        >
          {anim.currentPlaceholder}
        </span>
        <span
          className="absolute inset-x-0 top-0 text-base text-muted-foreground md:text-sm whitespace-pre-wrap break-words"
          style={{
            transform: anim.isAnimating ? 'translateY(0)' : 'translateY(100%)',
            opacity: anim.isAnimating ? 1 : 0,
            transition: anim.incomingTransition,
          }}
        >
          {anim.isAnimating
            ? Array.from(anim.nextPlaceholder).map((char, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline',
                    animation: `placeholder-char-in ${CHAR_ANIM_DURATION_MS}ms ease-out both`,
                    animationDelay: `${i * CHAR_STAGGER_MS}ms`,
                  }}
                >
                  {char}
                </span>
              ))
            : anim.nextPlaceholder}
        </span>
      </div>
    </div>
  );
}

function getChipDotColor(fileType?: string): string {
  if (!fileType) return tailwindColorToHex('text-muted-foreground');
  const twClass = fileIconColorByType[fileType as FileType] ?? 'text-muted-foreground';
  return tailwindColorToHex(twClass);
}

function clearEditable(root: HTMLElement) {
  root.replaceChildren();
}

function collapseAnimationSpans(root: HTMLElement): void {
  const spans = root.querySelectorAll('[data-voice-anim]');
  if (spans.length === 0) return;
  for (const span of spans) {
    span.parentNode?.replaceChild(document.createTextNode(span.textContent ?? ''), span);
  }
  root.normalize();
}

function ensureCaretAnchor(root: HTMLElement): Text {
  const firstChild = root.firstChild;
  if (firstChild?.nodeType === Node.TEXT_NODE) {
    return firstChild as Text;
  }

  const anchor = document.createTextNode('');
  root.replaceChildren(anchor);
  return anchor;
}

/** Walk child nodes and serialize contentEditable DOM → plain string with @mentions. */
function domToString(root: HTMLElement): string {
  let result = '';

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    // Mention chip → @name
    const mentionName = el.getAttribute('data-mention');
    if (mentionName) {
      result += `@${mentionName}`;
      return;
    }

    if (el.tagName === 'BR') {
      result += '\n';
      return;
    }

    // Block-level elements (div wrapping lines in Chrome/Firefox) add newlines
    const isBlock = el.tagName === 'DIV' || el.tagName === 'P';
    if (isBlock && result.length > 0 && !result.endsWith('\n')) {
      result += '\n';
    }

    for (const child of el.childNodes) {
      walk(child);
    }
  }

  for (const child of root.childNodes) {
    walk(child);
  }

  return result;
}

/** Compute cursor position as character offset in serialized string. */
function getCursorPos(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;

  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.setStart(root, 0);
  preRange.setEnd(range.startContainer, range.startOffset);

  const frag = preRange.cloneContents();
  const tmp = document.createElement('div');
  tmp.appendChild(frag);
  return domToString(tmp).length;
}

/** Create a styled mention chip span with colored dot + filename. */
function createMentionSpan(name: string, mentionTypes?: Map<string, string>): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-mention', name);
  span.style.cssText = 'display:inline-flex;align-items:center;gap:3px;border-radius:4px;padding:1px 6px 1px 4px;font-size:12px;font-weight:500;vertical-align:middle;user-select:none;line-height:1.4;';

  // Use CSS custom properties for theme-aware colors
  span.classList.add('mention-chip');

  // Colored dot indicator
  const dot = document.createElement('span');
  const fileType = mentionTypes?.get(name.toLowerCase());
  const dotColor = getChipDotColor(fileType);
  dot.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${dotColor};`;
  span.appendChild(dot);

  // Filename text
  span.appendChild(document.createTextNode(name));

  return span;
}

/** Append text to a parent, wrapping characters in the animate range with staggered spans. */
function appendTextSegment(
  parent: DocumentFragment | HTMLElement,
  text: string,
  globalOffset: number,
  animateRange: AnimateCharRange | undefined,
  animCharIndexRef: { current: number }
): void {
  if (!animateRange) {
    parent.appendChild(document.createTextNode(text));
    return;
  }

  const segEnd = globalOffset + text.length;

  if (segEnd <= animateRange.start || globalOffset >= animateRange.end) {
    parent.appendChild(document.createTextNode(text));
    return;
  }

  const overlapStart = Math.max(0, animateRange.start - globalOffset);
  const overlapEnd = Math.min(text.length, animateRange.end - globalOffset);

  if (overlapStart > 0) {
    parent.appendChild(document.createTextNode(text.slice(0, overlapStart)));
  }

  for (let i = overlapStart; i < overlapEnd; i++) {
    const span = document.createElement('span');
    span.className = 'voice-char-enter';
    span.setAttribute('data-voice-anim', '');
    span.style.animationDelay = `${animCharIndexRef.current * VOICE_CHAR_STAGGER_MS}ms`;
    span.textContent = text[i];
    parent.appendChild(span);
    animCharIndexRef.current++;
  }

  if (overlapEnd < text.length) {
    parent.appendChild(document.createTextNode(text.slice(overlapEnd)));
  }
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
    const savedPos = isFocused ? getCursorPos(root) : -1;

    collapseAnimationSpans(root);

    if (savedPos >= 0) {
      placeCursorAt(root, savedPos);
    }

    timerRef.current = null;
  }, totalTime);
}

/** Build DOM nodes from a string value, replacing @mentions with styled spans. */
function buildDOM(
  value: string,
  mentionNames: Set<string>,
  mentionTypes?: Map<string, string>,
  animateRange?: AnimateCharRange
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const mentionRegex = /@([\w.-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let globalOffset = 0;
  const animCharIndexRef = { current: 0 };

  const lines = value.split('\n');
  lines.forEach((line, lineIdx) => {
    lastIndex = 0;
    mentionRegex.lastIndex = 0;

    while ((match = mentionRegex.exec(line)) !== null) {
      const name = match[1];
      if (match.index > lastIndex) {
        const segment = line.slice(lastIndex, match.index);
        appendTextSegment(frag, segment, globalOffset, animateRange, animCharIndexRef);
        globalOffset += segment.length;
      }

      if (mentionNames.has(name.toLowerCase())) {
        frag.appendChild(createMentionSpan(name, mentionTypes));
      } else {
        appendTextSegment(frag, match[0], globalOffset, animateRange, animCharIndexRef);
      }
      globalOffset += match[0].length;

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      const segment = line.slice(lastIndex);
      appendTextSegment(frag, segment, globalOffset, animateRange, animCharIndexRef);
      globalOffset += segment.length;
    }

    if (lineIdx < lines.length - 1) {
      frag.appendChild(document.createElement('br'));
      globalOffset += 1;
    }
  });

  if (frag.childNodes.length === 0 && value.length > 0) {
    appendTextSegment(frag, value, 0, animateRange, animCharIndexRef);
  }

  return frag;
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

    const syncRenderedValue = useCallback((nextValue: string, cursorOffset?: number, animateRange?: AnimateCharRange) => {
      const el = divRef.current;
      if (!el) return;

      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
      cancelAnimationFrame(cursorRafRef.current);
      collapseAnimationSpans(el);

      lastValueRef.current = nextValue;
      if (nextValue) {
        clearEditable(el);
        el.appendChild(buildDOM(nextValue, mentionNames, mentionTypes, animateRange));
      } else {
        clearEditable(el);
      }

      if (cursorOffset !== undefined && !disabled) {
        if (document.activeElement !== el) {
          el.focus();
        }

        if (animateRange && animateRange.end > animateRange.start) {
          const totalNewChars = animateRange.end - animateRange.start;
          placeCursorAt(el, animateRange.start);
          const startTime = performance.now();

          const tick = () => {
            if (document.activeElement !== el) return;
            const elapsed = performance.now() - startTime;
            const charsRevealed = Math.min(
              Math.floor(elapsed / VOICE_CHAR_STAGGER_MS) + 1,
              totalNewChars
            );
            placeCursorAt(el, animateRange.start + charsRevealed);
            if (charsRevealed < totalNewChars) {
              cursorRafRef.current = requestAnimationFrame(tick);
            }
          };

          cursorRafRef.current = requestAnimationFrame(tick);
        } else {
          placeCursorAt(el, cursorOffset);
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

        const cursorPos = getCursorPos(el);
        const serialized = domToString(el);
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
        placeCursorAt(el, domToString(el).length);
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

        return getCursorPos(el);
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
          ? Math.min(getCursorPos(el), value.length)
          : undefined;
        syncRenderedValue(value, nextCursorOffset);
      }
    }, [syncRenderedValue, value]);

    const handleInput = useCallback(() => {
      if (composingRef.current) return;
      const el = divRef.current;
      if (!el) return;

      collapseAnimationSpans(el);

      const serialized = domToString(el);
      const normalizedValue = serialized === '\n' ? '' : serialized;
      const cursorPos = normalizedValue ? getCursorPos(el) : 0;

      if (!normalizedValue) {
        clearEditable(el);
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

    return (
      <div
        className={cn(
          'relative min-h-16 w-full flex-1',
          className
        )}
        style={themeColor ? { '--voice-theme-color': themeColor } as CSSProperties : undefined}
      >
        {value.length === 0 && !voiceActive && placeholders && placeholders.length > 1 ? (
          <AnimatedMentionPlaceholder placeholders={placeholders} />
        ) : value.length === 0 && (placeholders?.[0] ?? placeholder) ? (
          <span
            aria-hidden="true"
            className="mention-input-placeholder pointer-events-none absolute inset-x-3 top-2.5 text-base text-muted-foreground md:text-sm"
          >
            {placeholders?.[0] ?? placeholder}
          </span>
        ) : null}

        {voiceActive && value.length === 0 ? (
          <span
            aria-hidden="true"
            className="mention-input-voice-caret pointer-events-none absolute left-3 top-2.5"
          />
        ) : null}

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
          onKeyDown={onKeyDown}
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

/** Place the cursor at a given character offset in the serialized text. */
function placeCursorAt(root: HTMLElement, targetOffset: number) {
  if (root.childNodes.length === 0) {
    const anchor = ensureCaretAnchor(root);
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.setStart(anchor, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return;
  }

  let remaining = targetOffset;

  function walk(node: Node): { node: Node; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        return { node, offset: remaining };
      }
      remaining -= len;
      return null;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;

    const mentionName = el.getAttribute('data-mention');
    if (mentionName) {
      const mentionLen = mentionName.length + 1; // @name
      if (remaining <= mentionLen) {
        remaining = 0;
        const parent = el.parentNode;
        if (parent) {
          const idx = Array.from(parent.childNodes).indexOf(el as ChildNode);
          return { node: parent, offset: idx + 1 };
        }
      }
      remaining -= mentionLen;
      return null;
    }

    if (el.tagName === 'BR') {
      if (remaining === 0) {
        const parent = el.parentNode;
        if (parent) {
          const idx = Array.from(parent.childNodes).indexOf(el as ChildNode);
          return { node: parent, offset: idx + 1 };
        }
      }
      remaining -= 1;
      return null;
    }

    for (const child of el.childNodes) {
      const result = walk(child);
      if (result) return result;
    }
    return null;
  }

  const pos = walk(root);
  if (pos) {
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.setStart(pos.node, pos.offset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

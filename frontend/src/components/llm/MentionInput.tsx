import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent
} from 'react';
import { cn } from '@/lib/utils';
import { fileIconColorByType } from '@/lib/fileUtils';
import type { FileType } from '@/types/file';

export interface MentionInputHandle {
  insertMention(name: string): void;
  focus(): void;
  element(): HTMLDivElement | null;
}

interface MentionInputProps {
  value: string;
  onValueChange: (value: string, cursorPos?: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  mentionNames: Set<string>;
  /** Map from lowercase filename → file type (csv, json, etc.) for chip coloring */
  mentionTypes?: Map<string, string>;
  /** Resolved CSS color string for CSV/XLS chip dots (project theme color) */
  themeColor?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Tailwind color class → CSS color value for inline DOM styles. */
const COLOR_MAP: Record<string, string> = {
  'text-green-500': '#22c55e',
  'text-blue-500': '#3b82f6',
  'text-emerald-500': '#10b981',
  'text-red-500': '#ef4444',
  'text-purple-500': '#a855f7',
  'text-muted-foreground': '#a1a1aa',
};

/** CSV/XLS types that use the project theme color instead of their generic color. */
const THEME_COLORED_TYPES = new Set(['csv', 'excel']);

function getChipDotColor(fileType?: string, themeColor?: string): string {
  if (!fileType) return COLOR_MAP['text-muted-foreground'];
  if (themeColor && THEME_COLORED_TYPES.has(fileType)) return themeColor;
  const twClass = fileIconColorByType[fileType as FileType] ?? 'text-muted-foreground';
  return COLOR_MAP[twClass] ?? COLOR_MAP['text-muted-foreground'];
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
function createMentionSpan(name: string, mentionTypes?: Map<string, string>, themeColor?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-mention', name);
  span.style.cssText = 'display:inline-flex;align-items:center;gap:3px;border-radius:4px;padding:1px 6px 1px 4px;font-size:12px;font-weight:500;vertical-align:middle;user-select:none;line-height:1.4;';

  // Use CSS custom properties for theme-aware colors
  span.classList.add('mention-chip');

  // Colored dot indicator
  const dot = document.createElement('span');
  const fileType = mentionTypes?.get(name.toLowerCase());
  const dotColor = getChipDotColor(fileType, themeColor);
  dot.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;flex-shrink:0;background:${dotColor};`;
  span.appendChild(dot);

  // Filename text
  span.appendChild(document.createTextNode(name));

  return span;
}

/** Build DOM nodes from a string value, replacing @mentions with styled spans. */
function buildDOM(value: string, mentionNames: Set<string>, mentionTypes?: Map<string, string>, themeColor?: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const mentionRegex = /@([\w.-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const lines = value.split('\n');
  lines.forEach((line, lineIdx) => {
    lastIndex = 0;
    mentionRegex.lastIndex = 0;

    while ((match = mentionRegex.exec(line)) !== null) {
      const name = match[1];
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(line.slice(lastIndex, match.index)));
      }

      if (mentionNames.has(name.toLowerCase())) {
        frag.appendChild(createMentionSpan(name, mentionTypes, themeColor));
      } else {
        frag.appendChild(document.createTextNode(match[0]));
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      frag.appendChild(document.createTextNode(line.slice(lastIndex)));
    }

    if (lineIdx < lines.length - 1) {
      frag.appendChild(document.createElement('br'));
    }
  });

  if (frag.childNodes.length === 0 && value.length > 0) {
    frag.appendChild(document.createTextNode(value));
  }

  return frag;
}

export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(
  function MentionInput(
    { value, onValueChange, onKeyDown, mentionNames, mentionTypes, themeColor, placeholder, disabled, className },
    ref
  ) {
    const divRef = useRef<HTMLDivElement>(null);
    const lastValueRef = useRef(value);
    const composingRef = useRef(false);

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

        lastValueRef.current = newValue;
        el.innerHTML = '';
        el.appendChild(buildDOM(newValue, mentionNames, mentionTypes, themeColor));

        const targetOffset = atIndex + replacement.length;
        placeCursorAt(el, targetOffset);

        onValueChange(newValue, targetOffset);
      },
      focus() {
        divRef.current?.focus();
      },
      element() {
        return divRef.current;
      }
    }));

    // Sync DOM from external value changes (e.g. clearing after send)
    useEffect(() => {
      const el = divRef.current;
      if (!el) return;

      if (value !== lastValueRef.current) {
        lastValueRef.current = value;
        el.innerHTML = '';
        if (value) {
          el.appendChild(buildDOM(value, mentionNames, mentionTypes, themeColor));
        }
      }
    }, [value, mentionNames, mentionTypes]);

    const handleInput = useCallback(() => {
      if (composingRef.current) return;
      const el = divRef.current;
      if (!el) return;

      const serialized = domToString(el);
      const cursorPos = getCursorPos(el);

      if (serialized !== lastValueRef.current) {
        lastValueRef.current = serialized;
        onValueChange(serialized, cursorPos);
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
        ref={divRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-slot="input-group-control"
        data-placeholder={placeholder}
        role="textbox"
        aria-label="Message input"
        aria-disabled={disabled}
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        className={cn(
          'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50',
          // IMPORTANT: NO `flex` here — must be block so inline chips don't stretch
          'min-h-16 w-full flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none outline-none transition-[color,box-shadow] focus-visible:ring-0',
          'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-transparent',
          'whitespace-pre-wrap break-words',
          className
        )}
      />
    );
  }
);

/** Place the cursor at a given character offset in the serialized text. */
function placeCursorAt(root: HTMLElement, targetOffset: number) {
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

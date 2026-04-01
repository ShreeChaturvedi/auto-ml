import { fileIconColorByType, tailwindColorToHex } from '@/lib/fileUtils';
import type { FileType } from '@/types/file';

export interface AnimateCharRange { start: number; end: number }

export const VOICE_CHAR_STAGGER_MS = 14;
export const VOICE_CHAR_ANIM_MS = 180;

function getChipDotColor(fileType?: string): string {
  if (!fileType) return tailwindColorToHex('text-muted-foreground');
  const twClass = fileIconColorByType[fileType as FileType] ?? 'text-muted-foreground';
  return tailwindColorToHex(twClass);
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

function createMentionSpan(name: string, mentionTypes?: Map<string, string>): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-mention', name);
  span.classList.add('mention-chip');

  span.appendChild(document.createTextNode(name));

  const dot = document.createElement('span');
  dot.classList.add('mention-chip-dot');
  const fileType = mentionTypes?.get(name.toLowerCase());
  dot.style.background = getChipDotColor(fileType);
  span.appendChild(dot);

  return span;
}

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

export function clearMentionInputContent(root: HTMLElement) {
  root.replaceChildren();
}

export function collapseMentionInputAnimationSpans(root: HTMLElement): void {
  const spans = root.querySelectorAll('[data-voice-anim]');
  if (spans.length === 0) return;

  for (const span of spans) {
    span.parentNode?.replaceChild(document.createTextNode(span.textContent ?? ''), span);
  }

  root.normalize();
}

export function serializeMentionInputDOM(root: HTMLElement): string {
  let result = '';

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    const mentionName = el.getAttribute('data-mention');
    if (mentionName) {
      result += `@${mentionName}`;
      return;
    }

    if (el.tagName === 'BR') {
      result += '\n';
      return;
    }

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

export function getMentionInputCursorPos(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const range = selection.getRangeAt(0);
  const preRange = document.createRange();
  preRange.setStart(root, 0);
  preRange.setEnd(range.startContainer, range.startOffset);

  const fragment = preRange.cloneContents();
  const tempRoot = document.createElement('div');
  tempRoot.appendChild(fragment);

  return serializeMentionInputDOM(tempRoot).length;
}

export function buildMentionInputDOM(
  value: string,
  mentionNames: Set<string>,
  mentionTypes?: Map<string, string>,
  animateRange?: AnimateCharRange
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const mentionRegex = /@([\w.-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let globalOffset = 0;
  const animCharIndexRef = { current: 0 };

  const lines = value.split('\n');
  lines.forEach((line, lineIndex) => {
    lastIndex = 0;
    mentionRegex.lastIndex = 0;

    while ((match = mentionRegex.exec(line)) !== null) {
      const name = match[1];

      if (match.index > lastIndex) {
        const segment = line.slice(lastIndex, match.index);
        appendTextSegment(fragment, segment, globalOffset, animateRange, animCharIndexRef);
        globalOffset += segment.length;
      }

      if (mentionNames.has(name.toLowerCase())) {
        fragment.appendChild(createMentionSpan(name, mentionTypes));
      } else {
        appendTextSegment(fragment, match[0], globalOffset, animateRange, animCharIndexRef);
      }
      globalOffset += match[0].length;

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      const segment = line.slice(lastIndex);
      appendTextSegment(fragment, segment, globalOffset, animateRange, animCharIndexRef);
      globalOffset += segment.length;
    }

    if (lineIndex < lines.length - 1) {
      fragment.appendChild(document.createElement('br'));
      globalOffset += 1;
    }
  });

  if (fragment.childNodes.length === 0 && value.length > 0) {
    appendTextSegment(fragment, value, 0, animateRange, animCharIndexRef);
  }

  return fragment;
}

export function placeMentionInputCursorAt(root: HTMLElement, targetOffset: number) {
  if (root.childNodes.length === 0) {
    const anchor = ensureCaretAnchor(root);
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.setStart(anchor, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return;
  }

  let remaining = targetOffset;

  function walk(node: Node): { node: Node; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        return { node, offset: remaining };
      }
      remaining -= length;
      return null;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;

    const mentionName = el.getAttribute('data-mention');
    if (mentionName) {
      const mentionLength = mentionName.length + 1;
      if (remaining <= mentionLength) {
        remaining = 0;
        const parent = el.parentNode;
        if (parent) {
          const index = Array.from(parent.childNodes).indexOf(el as ChildNode);
          return { node: parent, offset: index + 1 };
        }
      }
      remaining -= mentionLength;
      return null;
    }

    if (el.tagName === 'BR') {
      if (remaining === 0) {
        const parent = el.parentNode;
        if (parent) {
          const index = Array.from(parent.childNodes).indexOf(el as ChildNode);
          return { node: parent, offset: index + 1 };
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

  const position = walk(root);
  if (!position) return;

  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.setStart(position.node, position.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

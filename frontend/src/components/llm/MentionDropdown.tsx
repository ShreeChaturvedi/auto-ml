import { useEffect, useLayoutEffect, useRef, useState, useMemo, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { resolveFileIcon, DATA_FILE_TYPES, isFileType } from '@/lib/fileUtils';
import { clampFloatingLeft, FLOATING_VIEWPORT_EDGE_PX } from '@/lib/clampFloatingLeft';
import { cn } from '@/lib/utils';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import type { MentionCandidate } from '@/hooks/useMentionAutocomplete';

const DROPDOWN_MAX_WIDTH_PX = 400;

interface MentionDropdownProps {
  isOpen: boolean;
  filtered: MentionCandidate[];
  activeIndex: number;
  anchorRef: RefObject<MentionInputHandle | null>;
  onSelect: (candidate: MentionCandidate) => void;
}

interface GroupedCandidates {
  dataFiles: MentionCandidate[];
  contextFiles: MentionCandidate[];
}

function groupCandidates(candidates: MentionCandidate[]): GroupedCandidates {
  const dataFiles: MentionCandidate[] = [];
  const contextFiles: MentionCandidate[] = [];
  for (const c of candidates) {
    if (isFileType(c.type) && DATA_FILE_TYPES.has(c.type)) {
      dataFiles.push(c);
    } else {
      contextFiles.push(c);
    }
  }
  return { dataFiles, contextFiles };
}

export function MentionDropdown({
  isOpen,
  filtered,
  activeIndex,
  anchorRef,
  onSelect
}: MentionDropdownProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<{ bottom: number; left: number } | null>(null);
  const [clampedLeft, setClampedLeft] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      setWasOpen(true);
    } else if (wasOpen) {
      setIsClosing(true);
    }
  }, [isOpen, wasOpen]);

  const handleAnimationEnd = () => {
    if (isClosing) {
      setIsClosing(false);
      setWasOpen(false);
    }
  };

  useEffect(() => {
    const el = anchorRef.current?.element() ?? null;
    if (!isOpen || !el) {
      if (!isClosing) {
        setPosition(null);
        setClampedLeft(null);
      }
      return;
    }
    const inputRect = el.getBoundingClientRect();
    setPosition({
      bottom: window.innerHeight - inputRect.top + 4,
      left: inputRect.left
    });
    setClampedLeft(null);
  }, [isOpen, anchorRef, isClosing]);

  useLayoutEffect(() => {
    if (!position) return;
    const syncLeft = () => {
      const node = listRef.current;
      if (!node) return;
      setClampedLeft(clampFloatingLeft(node, position.left));
    };
    syncLeft();
    window.addEventListener('resize', syncLeft);
    return () => window.removeEventListener('resize', syncLeft);
  }, [position, filtered, isOpen, isClosing]);

  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    const active = items[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const groups = useMemo(() => groupCandidates(filtered), [filtered]);
  const globalIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [filtered]);

  const shouldShow = isOpen || isClosing;
  if (!shouldShow || !position) return null;

  const showEmpty = isOpen && filtered.length === 0;

  const renderItem = (candidate: MentionCandidate, globalIndex: number) => {
    const { Icon, colorClass } = resolveFileIcon(candidate.type);

    return (
      <li
        key={candidate.id}
        id={`mention-option-${candidate.id}`}
        role="option"
        aria-selected={globalIndex === activeIndex}
        className={cn(
          'flex min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
          globalIndex === activeIndex
            ? 'bg-accent text-accent-foreground'
            : 'text-popover-foreground hover:bg-accent/50'
        )}
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(candidate);
        }}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', colorClass)} />
        <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
      </li>
    );
  };

  const hasDataFiles = groups.dataFiles.length > 0;
  const hasContextFiles = groups.contextFiles.length > 0;
  const maxWidthCss = `min(${DROPDOWN_MAX_WIDTH_PX}px, calc(100vw - ${FLOATING_VIEWPORT_EDGE_PX * 2}px))`;

  return createPortal(
    <ul
      ref={listRef}
      role="listbox"
      aria-label="File mentions"
      className={cn(
        'fixed z-50 w-max max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md',
        isClosing ? 'animate-mention-out' : 'animate-mention-in'
      )}
      style={{
        bottom: position.bottom,
        left: clampedLeft ?? position.left,
        maxWidth: maxWidthCss
      }}
      onAnimationEnd={handleAnimationEnd}
    >
      <li
        className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground select-none"
        aria-hidden
      >
        Files
      </li>

      {showEmpty ? (
        <li className="px-2 py-3 text-center text-xs text-muted-foreground">No matching files</li>
      ) : (
        <>
          {hasDataFiles ? groups.dataFiles.map((c) => renderItem(c, globalIndexMap.get(c.id)!)) : null}

          {hasContextFiles ? (
            <>
              {hasDataFiles ? <li className="my-1 border-t border-border/50" aria-hidden /> : null}
              {groups.contextFiles.map((c) => renderItem(c, globalIndexMap.get(c.id)!))}
            </>
          ) : null}
        </>
      )}
    </ul>,
    document.body
  );
}

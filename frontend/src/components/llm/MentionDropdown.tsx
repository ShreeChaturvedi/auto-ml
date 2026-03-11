import { useEffect, useRef, useState, useMemo, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { resolveFileIcon, DATA_FILE_TYPES } from '@/lib/fileUtils';
import { cn } from '@/lib/utils';
import type { MentionInputHandle } from '@/components/llm/MentionInput';
import type { MentionCandidate } from '@/hooks/useMentionAutocomplete';

interface MentionDropdownProps {
  isOpen: boolean;
  filtered: MentionCandidate[];
  activeIndex: number;
  anchorRef: RefObject<MentionInputHandle | null>;
  onSelect: (candidate: MentionCandidate) => void;
  /** Project theme color class (e.g. 'text-blue-500') for CSV/XLS icons */
  themeColorClass?: string;
}

interface GroupedCandidates {
  dataFiles: MentionCandidate[];
  contextFiles: MentionCandidate[];
}

function groupCandidates(candidates: MentionCandidate[]): GroupedCandidates {
  const dataFiles: MentionCandidate[] = [];
  const contextFiles: MentionCandidate[] = [];
  for (const c of candidates) {
    if (DATA_FILE_TYPES.has(c.type)) {
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
  onSelect,
  themeColorClass
}: MentionDropdownProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [position, setPosition] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  // Track open/close transitions for exit animation
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

  // Anchor dropdown directly above the input element, overlaying suggestion pills.
  // Only recompute when isOpen transitions — the input element doesn't move while typing.
  useEffect(() => {
    const el = anchorRef.current?.element() ?? null;
    if (!isOpen || !el) {
      if (!isClosing) setPosition(null);
      return;
    }
    const inputRect = el.getBoundingClientRect();
    setPosition({
      bottom: window.innerHeight - inputRect.top + 4,
      left: inputRect.left,
      width: Math.min(Math.max(inputRect.width, 240), 400)
    });
  }, [isOpen, anchorRef, isClosing]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    const active = items[activeIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const groups = useMemo(() => groupCandidates(filtered), [filtered]);

  const shouldShow = isOpen || isClosing;
  if (!shouldShow || !position) return null;

  const showEmpty = isOpen && filtered.length === 0;

  /** Render a single candidate item. globalIndex is its position in the flat filtered array. */
  const renderItem = (candidate: MentionCandidate, globalIndex: number) => {
    const { Icon, colorClass, usesTheme } = resolveFileIcon(candidate.type);

    return (
      <li
        key={candidate.id}
        id={`mention-option-${candidate.id}`}
        role="option"
        aria-selected={globalIndex === activeIndex}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
          globalIndex === activeIndex
            ? 'bg-accent text-accent-foreground'
            : 'text-popover-foreground hover:bg-accent/50'
        )}
        onMouseDown={(e) => {
          e.preventDefault(); // prevent input blur
          onSelect(candidate);
        }}
      >
        <Icon
          className={cn('h-3.5 w-3.5 shrink-0', !usesTheme && colorClass)}
          {...(usesTheme ? { themeColorClass, isActive: true } : {})}
        />
        <span className="truncate">{candidate.name}</span>
      </li>
    );
  };

  // Build flat index map so grouped rendering can compute globalIndex
  const globalIndexMap = new Map<string, number>();
  filtered.forEach((c, i) => globalIndexMap.set(c.id, i));

  const hasDataFiles = groups.dataFiles.length > 0;
  const hasContextFiles = groups.contextFiles.length > 0;
  const showGroupHeaders = hasDataFiles && hasContextFiles;

  return createPortal(
    <ul
      ref={listRef}
      role="listbox"
      aria-label="File mentions"
      className={cn(
        'fixed z-50 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md',
        isClosing ? 'animate-mention-out' : 'animate-mention-in'
      )}
      style={{
        bottom: position.bottom,
        left: position.left,
        width: position.width,
        minWidth: 240
      }}
      onAnimationEnd={handleAnimationEnd}
    >
      {/* Header */}
      <li className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider select-none" aria-hidden>
        Files
      </li>

      {showEmpty ? (
        <li className="px-2 py-3 text-center text-xs text-muted-foreground">
          No matching files
        </li>
      ) : (
        <>
          {hasDataFiles ? (
            <>
              {showGroupHeaders ? (
                <li className="px-2 pt-1.5 pb-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider select-none" aria-hidden>
                  Data Files
                </li>
              ) : null}
              {groups.dataFiles.map((c) => renderItem(c, globalIndexMap.get(c.id)!))}
            </>
          ) : null}

          {hasContextFiles ? (
            <>
              {showGroupHeaders ? (
                <li className={cn(
                  'px-2 pb-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider select-none',
                  hasDataFiles && 'pt-2 mt-1 border-t border-border/50'
                )} aria-hidden>
                  Context Files
                </li>
              ) : null}
              {groups.contextFiles.map((c) => renderItem(c, globalIndexMap.get(c.id)!))}
            </>
          ) : null}
        </>
      )}
    </ul>,
    document.body
  );
}

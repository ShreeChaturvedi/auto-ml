import { useEffect, useRef, useState } from 'react';
import { MousePointer2 } from 'lucide-react';
import { NotebookDeepDivePreview } from '@frontend/demo/landing/NotebookDeepDivePreview';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { useScrollPlayOnce } from './useScrollPlayOnce';
import styles from './NotebookDeepDive.module.css';

/**
 * Deep-dive 3 — NOTEBOOK visual. Wraps the real frontend
 * `<NotebookDeepDivePreview>` (which renders actual
 * `<NotebookCellComponent>`s fed from a static seed) with a scripted
 * cursor overlay that plays on scroll-into-view.
 *
 * Timeline (only fires on IO-enter past 35% threshold, via
 * `useScrollPlayOnce`):
 *   t≈500  — cursor glides to cell 1's Run button
 *   t≈1350 — click pulse, cell 1 gets "run highlight", output fades in
 *   t≈2600 — cursor glides to cell 2's Run button
 *   t≈3450 — click pulse, cell 2 run highlight, output fades in
 *   t≈4200 — cursor fades, final steady state (both outputs visible)
 *
 * The cells themselves are rendered with `executionStatus: 'success'` so
 * their outputs exist in the DOM at mount time. We hide those outputs via
 * CSS (`.output-hidden`) until the cursor "runs" each cell, at which point
 * we flip a per-cell `data-output-visible` attribute to reveal them. This
 * keeps all control flow external to the frontend module — the real
 * NotebookCellComponent is untouched.
 *
 * `prefers-reduced-motion` short-circuits to the final steady state: no
 * cursor, all outputs immediately visible. This matches Chat's behavior.
 */

// Cell IDs match the ones hardcoded in
// `frontend/src/demo/landing/NotebookDeepDivePreview.tsx`. We use them to
// find each cell's wrapper + Run button in the rendered DOM.
const CELL_IDS = [
  'landing-notebook-cell-1',
  'landing-notebook-cell-2',
] as const;

type Phase =
  | 'idle'
  | 'cursor-glide'
  | 'cursor-click'
  | 'done';

// Timing in ms. Chosen so the whole sequence lands in ~4.2s — same ballpark
// as the Chat and Plan timelines, so all three reveal-sequences feel
// rhythmically aligned when a user scrolls through the features stack.
const TIMING = {
  preGlide: 500,
  glideDuration: 850,
  clickHold: 260,
  interCellGap: 650,
  finalDwell: 480,
} as const;

function NotebookDeepDiveVisual() {
  const reduced = usePrefersReducedMotion();
  const { ref: rootRef, hasPlayed } = useScrollPlayOnce<HTMLDivElement>(0.35);

  const [phase, setPhase] = useState<Phase>('idle');
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  // Which cell indices have had their output revealed so far.
  // Reduced-motion: pre-reveal everything.
  const [revealedIdx, setRevealedIdx] = useState<number>(() =>
    reduced ? CELL_IDS.length : 0,
  );
  // Which cell index is currently "pulsing" from a cursor click.
  const [activeCellIdx, setActiveCellIdx] = useState<number | null>(null);

  const timelineStartedRef = useRef(false);

  const computeTargetPos = (target: Element): { x: number; y: number } | null => {
    const root = rootRef.current;
    if (!root) return null;
    const rootRect = root.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    if (tRect.width === 0 && tRect.height === 0) return null;
    return {
      x: tRect.left - rootRect.left + tRect.width / 2,
      y: tRect.top - rootRect.top + tRect.height / 2,
    };
  };

  // Helper to find a cell's root + Run button in the DOM. Cells don't emit
  // their own `cellId` attribute, so we rely on the stable order of cell
  // wrappers as rendered by `NotebookDeepDivePreview`.
  const getCellNodes = (index: number): {
    cell: HTMLElement | null;
    runButton: HTMLButtonElement | null;
  } => {
    const root = rootRef.current;
    if (!root) return { cell: null, runButton: null };
    // Each NotebookCellComponent renders as `<div class="group overflow-hidden rounded-lg ...">`
    // at the top level of the preview's column. We target them by position.
    const cells = root.querySelectorAll<HTMLElement>(
      '[data-notebook-cell-wrapper]',
    );
    const cell = cells[index] ?? null;
    const runButton = cell?.querySelector<HTMLButtonElement>(
      'button[aria-label="Run cell"]',
    ) ?? null;
    return { cell, runButton };
  };

  // After mount, wrap each cell in a `[data-notebook-cell-wrapper]` marker
  // by walking the rendered DOM. This is cleaner than forking
  // NotebookDeepDivePreview — we simply tag the real `.group` cell nodes
  // post-render so our cursor targeting has stable selectors.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // The preview mounts `<NotebookCellComponent>` for each seed cell.
    // Each one renders as a direct child `.group` div inside the flex
    // container. We tag them by position.
    const tag = () => {
      const host = root.querySelector<HTMLElement>(
        '[data-testid="notebook-deep-dive-host"]',
      );
      if (!host) return;
      // `<NotebookDeepDivePreview>` renders its own flex column wrapper as
      // our host's single child; the real `<NotebookCellComponent>` roots
      // sit one level below that. Walk there and tag each cell wrapper
      // positionally so lookups stay O(1).
      const column = host.firstElementChild as HTMLElement | null;
      if (!column) return;
      const kids = column.children;
      for (let i = 0; i < kids.length; i += 1) {
        const el = kids[i] as HTMLElement;
        el.setAttribute('data-notebook-cell-wrapper', String(i));
      }
    };
    tag();
    // Re-tag after a tick in case of async hydration (Monaco, etc.).
    const t = setTimeout(tag, 0);
    return () => clearTimeout(t);
    // `rootRef` is stable across renders (a `useRef` result from
    // `useScrollPlayOnce`), so we explicitly exclude it from the deps to
    // keep this effect as mount-once behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reduced) return;
    if (!hasPlayed) return;
    if (timelineStartedRef.current) return;
    timelineStartedRef.current = true;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, delay: number) => {
      timers.push(setTimeout(fn, delay));
    };

    let cursor = TIMING.preGlide;

    CELL_IDS.forEach((_id, idx) => {
      // --- Step A: glide cursor onto cell's Run button ------------------
      schedule(() => {
        const { runButton, cell } = getCellNodes(idx);
        const target = runButton ?? cell;
        if (!target) return;
        const pos = computeTargetPos(target);
        if (pos) setCursorPos(pos);
        setPhase('cursor-glide');
      }, cursor);

      cursor += TIMING.glideDuration;

      // --- Step B: click pulse, reveal output ---------------------------
      schedule(() => {
        setPhase('cursor-click');
        setActiveCellIdx(idx);
        // Reveal this cell's output — the CSS fades it in from below.
        setRevealedIdx((prev) => Math.max(prev, idx + 1));
      }, cursor);

      cursor += TIMING.clickHold;

      // Clear the active pulse once the ripple finishes so the next
      // cell's pulse isn't "sticky".
      schedule(() => {
        setActiveCellIdx((prev) => (prev === idx ? null : prev));
      }, cursor);

      cursor += TIMING.interCellGap;
    });

    // --- Final: fade out cursor -----------------------------------------
    schedule(() => {
      setPhase('done');
    }, cursor + TIMING.finalDwell);

    return () => {
      for (const t of timers) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlayed, reduced]);

  // Keep the DOM's per-cell reveal attribute in sync with React state.
  // We do this imperatively because the cell components themselves belong
  // to the frontend module — we're layering animation on top, not forking
  // them. A CSS selector in NotebookDeepDive.module.css matches
  // `[data-notebook-cell-wrapper][data-output-visible='true']` to drive
  // the fade-in.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cells = root.querySelectorAll<HTMLElement>(
      '[data-notebook-cell-wrapper]',
    );
    cells.forEach((el, i) => {
      const visible = i < revealedIdx ? 'true' : 'false';
      el.setAttribute('data-output-visible', visible);
      const active = activeCellIdx === i ? 'true' : 'false';
      el.setAttribute('data-cell-active', active);
    });
    // `rootRef` is stable (useRef from useScrollPlayOnce); including it
    // would force the effect to re-run for no behavioral reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedIdx, activeCellIdx]);

  const renderCursor = !reduced && phase !== 'done' && phase !== 'idle';

  const cursorStyle: React.CSSProperties = cursorPos
    ? { left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }
    : {};

  return (
    <div ref={rootRef} className={cn(styles.root, reduced && styles.rootReduced)}>
      <div className={styles.host} data-testid="notebook-deep-dive-host">
        <NotebookDeepDivePreview />
      </div>

      {renderCursor && (
        <MousePointer2
          className={cn(
            styles.cursorSprite,
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

export default function NotebookDeepDive() {
  return <NotebookDeepDiveVisual />;
}

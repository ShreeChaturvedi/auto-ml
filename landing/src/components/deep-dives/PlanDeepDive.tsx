import { useEffect, useRef, useState } from 'react';
import { MousePointer2, Search, List, Copy, Download } from 'lucide-react';
import { QuestionCards } from '@frontend/components/upload/QuestionCards';
import { PlanViewerPane } from '@frontend/components/upload/PlanViewerPane';
import type { AskUserQuestion } from '@frontend/types/llmUi';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import { useScrollPlayOnce } from './useScrollPlayOnce';
import styles from './PlanDeepDive.module.css';

/**
 * Deep-dive 2 — PLAN visual. Mounts the real frontend `<QuestionCards>`
 * component wired to a 3-step static flow (target / task / compute) per
 * spec §4.5, and overlays a scripted cursor that walks through each
 * question on scroll-into-view.
 *
 * Mechanics parallel the ChatDeepDive timeline:
 *   • `useScrollPlayOnce` fires once when the section enters the viewport.
 *   • A cursor sprite is positioned absolutely over the visual via the
 *     real DOM bounding rects of each target (option card / Next button),
 *     so the cursor always lands on the right spot regardless of layout.
 *   • The cursor performs three phases for each of the three questions:
 *       1. glide onto an option card → click → ripple
 *       2. glide onto the Next/Submit button → click → advance
 *     Total run time ≈ 7s, matching the Chat timeline's rhythm.
 *   • Clicking is real — we dispatch `.click()` on the underlying DOM
 *     button so QuestionCards' internal React state transitions exactly
 *     as a user click would produce. The submit is wired to a no-op.
 *   • `prefers-reduced-motion` short-circuits all of this: the final
 *     state just shows the first question card, already rendered.
 */

const PLAN_QUESTIONS: AskUserQuestion[] = [
  {
    id: 'target',
    header: 'Target',
    question: "What's your target variable?",
    type: 'single_select',
    allowCustom: false,
    options: [
      { label: 'is_active', description: 'Boolean churn indicator' },
      { label: 'mrr_usd', description: 'Monthly recurring revenue' },
      { label: 'escalated', description: 'Ticket escalation flag' },
    ],
  },
  {
    id: 'task',
    header: 'Task',
    question: 'Which modeling task?',
    type: 'single_select',
    allowCustom: false,
    options: [
      { label: 'Classification', description: 'Predict a category' },
      { label: 'Regression', description: 'Predict a number' },
      { label: 'Clustering', description: 'Find groups' },
      { label: 'Time-series', description: 'Forecast over time' },
    ],
  },
  {
    id: 'compute',
    header: 'Compute',
    question: 'How much compute?',
    type: 'single_select',
    allowCustom: false,
    options: [
      { label: 'Quick (5 min)', description: 'Fast iteration' },
      { label: 'Standard (15 min)', description: 'Balanced search' },
      { label: 'Deep (1h)', description: 'Thorough search' },
    ],
  },
];

// Which option label each question should auto-select during the scripted
// walkthrough. Chosen to tell a coherent churn-prediction story:
//   target = is_active (the churn flag) → classification → standard budget
const SCRIPTED_CHOICES: Record<string, string> = {
  target: 'is_active',
  task: 'Classification',
  compute: 'Standard (15 min)',
};

const NOOP_SUBMIT = () => {};

const PLAN_RESULT = {
  id: 'landing-plan-preview',
  name: 'Retention Recovery',
  content: `# Retention Recovery

## Objective

Predict **is_active** (binary churn indicator) using a classification pipeline. Primary metric: **F1** (macro). Secondary: AUC-ROC, calibration.

## Data Summary

\`customers.csv\` - 2,530 rows, 14 columns. Target is boolean \`is_active\` with ~18% churn rate. Key signals: \`mrr_usd\`, \`avg_session_minutes\`, \`support_tickets_90d\`, \`account_tier\`.

## Approach

Diagnose data quality risks before modeling. Impute missing support signals with zeros (confirmed absent = no tickets). Normalize spend columns. Stratified 5-fold CV across all candidates.

## Feature Engineering

1. **Temporal aggregates** - rolling 7/14/30-day windows for \`mrr_usd\`, \`avg_session_minutes\`, \`api_calls\`
2. **Ratio features** - \`support_ticket_velocity\`, \`expansion_ratio\` (current MRR / first-month MRR)
3. **Encoding** - ordinal-encode \`account_tier\` (starter -> pro -> enterprise)

## Model Candidates

- XGBoost (\`xgboost\`) - 40 Optuna trials
- LightGBM (\`lightgbm\`) - 40 trials
- Random Forest (\`sklearn\`) - 40 trials

## Evaluation

- Stratified 5-fold cross-validation
- Primary: F1 (macro-averaged)
- Secondary: AUC-ROC, precision, recall
- Calibration curve + Brier score on hold-out set

## Compute Budget

Standard - 15 minutes wall-clock, 120 Optuna trials total.`,
} as const;


type Phase = 'idle' | 'cursor-glide' | 'cursor-click' | 'done';

// Timing constants — kept in one place so the overall rhythm is easy to
// eyeball and tune. Total ≈ 6.8s from intersect → done.
const TIMING = {
  preGlide: 700,       // t=0 → first glide begins
  clickAfterGlide: 800, // glide duration before the click pulse fires
  holdAfterClick: 260,  // post-click dwell so the ripple is visible
  stepGap: 440,         // wait between "option-click" and "next-click"
  questionGap: 600,     // wait between questions after the Next click
} as const;

function PlanDeepDiveVisual() {
  const reduced = usePrefersReducedMotion();
  const { ref: rootRef, hasPlayed } = useScrollPlayOnce<HTMLDivElement>(0.35);

  const [phase, setPhase] = useState<Phase>('idle');
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [showPlan, setShowPlan] = useState(false);

  const timelineStartedRef = useRef(false);

  // Compute the center of a target DOM node relative to `.root` so the
  // cursor can land on it. Returns null if the node isn't on screen.
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

  // Fire the scripted walkthrough. Uses setTimeout chains (like Chat) so
  // cleanup is a simple `clearTimeout` per tick on unmount.
  useEffect(() => {
    if (reduced) return;
    if (!hasPlayed) return;
    if (timelineStartedRef.current) return;
    timelineStartedRef.current = true;

    const root = rootRef.current;
    if (!root) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, delay: number) => {
      timers.push(setTimeout(fn, delay));
    };

    // Resolve DOM targets by the data-testid conventions QuestionCards
    // already emits. We re-query on each step because the DOM changes as
    // the current question advances.
    const findOption = (questionId: string, label: string): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>(
        `[data-testid="single-option-${questionId}-${label}"]`,
      );
    const findNext = (): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>('[data-testid="question-nav-next"]');
    const findSubmit = (): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>('[data-testid="question-submit-button"]');

    let cursor = TIMING.preGlide;

    PLAN_QUESTIONS.forEach((question, qIndex) => {
      const choice = SCRIPTED_CHOICES[question.id];
      const isLast = qIndex === PLAN_QUESTIONS.length - 1;

      // --- Step A: glide to the option card for this question ------------
      schedule(() => {
        const optionEl = findOption(question.id, choice);
        if (!optionEl) return;
        const pos = computeTargetPos(optionEl);
        if (pos) setCursorPos(pos);
        setPhase('cursor-glide');
      }, cursor);

      cursor += TIMING.clickAfterGlide;

      // --- Step B: click the option card ---------------------------------
      schedule(() => {
        setPhase('cursor-click');
        const optionEl = findOption(question.id, choice);
        optionEl?.click();
      }, cursor);

      cursor += TIMING.holdAfterClick + TIMING.stepGap;

      // --- Step C: glide to the Next (or Submit) button ------------------
      schedule(() => {
        const btn = isLast ? findSubmit() : findNext();
        if (!btn) return;
        const pos = computeTargetPos(btn);
        if (pos) setCursorPos(pos);
        setPhase('cursor-glide');
      }, cursor);

      cursor += TIMING.clickAfterGlide;

      // --- Step D: click Next / Submit -----------------------------------
      schedule(() => {
        setPhase('cursor-click');
        if (!isLast) {
          findNext()?.click();
        }
      }, cursor);

      cursor += TIMING.holdAfterClick + TIMING.questionGap;
    });

    // After submit click: fade cursor out, then reveal plan result.
    schedule(() => {
      setPhase('done');
    }, cursor);

    schedule(() => {
      setShowPlan(true);
    }, cursor + 300);

    return () => {
      for (const t of timers) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlayed, reduced]);

  // Don't render the cursor sprite at all for reduced-motion, and fade it
  // out once the timeline reaches `done`.
  const renderCursor = !reduced && phase !== 'done' && phase !== 'idle';

  const cursorStyle: React.CSSProperties = cursorPos
    ? { left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }
    : {};

  return (
    <div ref={rootRef} className={styles.root}>
      {!showPlan && (
        <div className={styles.questionStage}>
          <QuestionCards
            questions={PLAN_QUESTIONS}
            onSubmit={NOOP_SUBMIT}
            disabled={false}
          />
        </div>
      )}

      {showPlan && (
        <div className={styles.planViewer}>
          <div className={styles.planToolbar}>
            <span className={styles.planToolbarTitle}>Retention Recovery</span>
            <div className={styles.planToolbarActions}>
              <button type="button" className={styles.planToolbarBtn} tabIndex={-1} aria-label="Search">
                <Search size={14} />
              </button>
              <button type="button" className={styles.planToolbarBtn} tabIndex={-1} aria-label="Table of contents">
                <List size={14} />
              </button>
              <button type="button" className={styles.planToolbarBtn} tabIndex={-1} aria-label="Copy">
                <Copy size={14} />
              </button>
              <button type="button" className={styles.planToolbarBtn} tabIndex={-1} aria-label="Export">
                <Download size={14} />
              </button>
            </div>
          </div>
          <div className={styles.planBody}>
            <div className={styles.planContent}>
              <div className="dark">
                <PlanViewerPane plan={PLAN_RESULT} searchQuery="" />
              </div>
            </div>
            <div className={styles.planFade} />
          </div>
        </div>
      )}

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

export default function PlanDeepDive() {
  return <PlanDeepDiveVisual />;
}

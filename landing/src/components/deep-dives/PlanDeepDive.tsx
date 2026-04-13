import { useEffect, useRef } from 'react';
import { QuestionCards } from '@frontend/components/upload/QuestionCards';
import type { AskUserQuestion } from '@frontend/types/llmUi';
import styles from './PlanDeepDive.module.css';

/**
 * Deep-dive 2 — PLAN visual. Mounts the real frontend `<QuestionCards>`
 * component wired to a 3-step static flow (target / task / compute) per
 * spec §4.5. The component owns its own step navigation and Next button
 * advancement; final submit is a no-op because the landing page runs in
 * demo mode with zero API access.
 *
 * The shared `<DeepDive>` chrome (eyebrow, headline, body, kbd hint) is
 * composed around this by `FeaturesSection.astro` — this component renders
 * only the right-hand visual content. The `.cursor-outline` wrapper is
 * applied by `DeepDive.astro` as well, so nothing extra is required here.
 */

// Real `AskUserQuestion` shape (see `frontend/src/types/llmUi.ts`). The zod
// schema requires a `description` on every select option, so each option
// carries a short explanatory string even though the spec prose only names
// the labels.
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

// Spec §4.5: "Final Create plan button is no-op." The landing page runs in
// demo mode with zero API access, so the submit handler is a pure noop.
const NOOP_SUBMIT = () => {};

export default function PlanDeepDive() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // IO-enter animation: fade + 12px translateY over 500ms with --ease-out-quart
  // per spec §4.5 shared anatomy. Reduced-motion: the CSS fallback paints the
  // final frame instantly so the content stays visible if the effect never
  // runs (SSR, older jsdom, or reduced-motion preference).
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    if (typeof window === 'undefined') return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      node.style.opacity = '1';
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      node.style.opacity = '1';
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const easing =
            getComputedStyle(node).getPropertyValue('--ease-out-quart').trim() ||
            'cubic-bezier(0.165, 0.84, 0.44, 1)';
          node.animate(
            [
              { opacity: 0, transform: 'translateY(12px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 500, easing, fill: 'forwards' },
          );
          observer.unobserve(node);
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className={styles.root}>
      <QuestionCards
        questions={PLAN_QUESTIONS}
        onSubmit={NOOP_SUBMIT}
        disabled={false}
      />
    </div>
  );
}

import { useState } from 'react';
import { QuestionCards } from '@frontend/components/upload/QuestionCards';
import type { AskUserQuestion, QuestionAnswer } from '@frontend/types/llmUi';
import styles from './PlanDeepDive.module.css';

// Real AskUserQuestion shape (see frontend/src/types/llmUi.ts): requires
// `header`, uses `type: 'single_select' | 'multi_select' | 'free_text'`, and
// each option carries a `description`. Matches the fixture adapted for the
// UploadView preview tab in Phase 6b / Task 39.
const QUESTIONS: AskUserQuestion[] = [
  {
    id: 'q1',
    header: 'Target',
    question: "What's your target variable?",
    type: 'single_select',
    options: [
      { label: 'is_active', description: 'Customer churn (classification)' },
      { label: 'mrr_usd', description: 'Recurring revenue (regression)' },
      { label: 'escalated', description: 'Ticket escalation (classification)' },
    ],
  },
  {
    id: 'q2',
    header: 'Task',
    question: 'Which modeling task?',
    type: 'single_select',
    options: [
      { label: 'Classification', description: 'Predict a category' },
      { label: 'Regression', description: 'Predict a number' },
      { label: 'Clustering', description: 'Find groups' },
      { label: 'Time-series', description: 'Forecast over time' },
    ],
  },
  {
    id: 'q3',
    header: 'Compute',
    question: 'How much compute?',
    type: 'single_select',
    options: [
      { label: 'Quick (5 min)', description: 'Fast iteration' },
      { label: 'Standard (15 min)', description: 'Balanced' },
      { label: 'Deep (1h)', description: 'Thorough search' },
    ],
  },
];

export default function PlanDeepDive() {
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);

  return (
    <div className={styles.root}>
      <p className={styles.title}>PLANNER · 3 QUESTIONS</p>
      <div className={styles.stepProgress} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`${styles.stepDot} ${i <= answers.length ? styles.stepDotActive : ''}`}
          />
        ))}
      </div>
      <QuestionCards
        questions={QUESTIONS}
        disabled={false}
        onSubmit={(answerSet) => {
          // Demo-only — do not call any API. Just advance the progress dots.
          setAnswers(answerSet);
        }}
      />
    </div>
  );
}

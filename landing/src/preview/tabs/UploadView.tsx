import { Check, FileText } from 'lucide-react';
import { mockPlan } from '@/preview/fixtures/plan';
import { ComputeAnimation } from '@frontend/components/upload/ComputeAnimation';
import { QuestionCards } from '@frontend/components/upload/QuestionCards';
import type { ProcessingResult } from '@frontend/types/processing';
import type { AskUserQuestion } from '@frontend/types/llmUi';
import styles from './UploadView.module.css';

const DEMO_FILES: Array<{ name: string; type: string }> = [
  { name: 'customers.csv', type: 'text/csv' },
];

const DEMO_RESULTS: ProcessingResult[] = [
  {
    type: 'dataset_stats',
    icon: 'bar-chart',
    label: '2,530 rows',
    detail: '14 columns',
  },
  {
    type: 'schema_analysis',
    icon: 'table',
    label: '14 columns typed',
    detail: '6 numeric · 8 categorical',
  },
  {
    type: 'quality_check',
    icon: 'alert-triangle',
    label: '4 data-quality issues',
    detail: 'nulls · duplicates · outliers',
  },
];

const PLAN_QUESTIONS: AskUserQuestion[] = [
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

export function UploadView() {
  return (
    <div className={styles.root}>
      <div className={styles.fileCard}>
        <div className={styles.fileCardHeader}>
          <FileText size={18} aria-hidden="true" />
          <span className={styles.fileCardName}>customers.csv</span>
          <span className={styles.fileCardStatus}>READY</span>
        </div>
        <div className={styles.fileMetaRow}>
          <span>2,530 rows</span>
          <span>14 columns</span>
          <span>482 KB</span>
        </div>
      </div>

      <ComputeAnimation
        files={DEMO_FILES}
        results={DEMO_RESULTS}
        isComplete={true}
        durationScale={0.75}
      />

      <div className={styles.planCard}>
        <h3 className={styles.planTitle}>{mockPlan.title}</h3>
        {mockPlan.steps.map((step) => (
          <div key={step.id} className={styles.planStep}>
            <div className={styles.planStepCheck}><Check size={10} aria-hidden="true" /></div>
            <div className={styles.planStepBody}>
              <div className={styles.planStepLabel}>{step.label}</div>
              <div className={styles.planStepDesc}>{step.description}</div>
            </div>
          </div>
        ))}
      </div>

      <QuestionCards
        questions={PLAN_QUESTIONS}
        onSubmit={() => {
          /* no-op in demo mode */
        }}
        disabled={false}
      />
    </div>
  );
}

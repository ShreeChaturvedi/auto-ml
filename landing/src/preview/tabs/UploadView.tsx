import { Check, FileText, Sparkles } from 'lucide-react';
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

/**
 * UploadView — "completed state" of the real Upload phase.
 *
 * Visual target is the PlanChatPane in the real app *after* the file has been
 * uploaded and processed: a single chat-style timeline containing the uploaded
 * file row, the ComputeAnimation replaying its analysis reveal, the generated
 * plan card, and the QuestionCards planner island.
 *
 * ComputeAnimation "replay on tab enter" (spec §4.3 / §5.5) is handled for
 * free: PreviewShell only mounts the active tab's view, so each time the
 * visitor clicks Upload this component remounts and the animation's internal
 * stagger state resets to zero.
 */
export function UploadView() {
  return (
    <div className={styles.root} data-testid="landing-upload-view">
      <div className={styles.column}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>Plan 01 · Churn prediction</div>
          <div className={styles.headerMeta}>NovaCraft — Customer Churn</div>
        </div>

        <div className={styles.timeline}>
          {/* System card: uploaded file summary */}
          <section className={styles.fileCard} aria-label="Uploaded file">
            <div className={styles.fileRow}>
              <div className={styles.fileIcon} aria-hidden="true">
                <FileText size={16} />
              </div>
              <span className={styles.fileName}>customers.csv</span>
              <span className={styles.fileSize}>482 KB</span>
            </div>
            <div className={styles.fileMeta}>
              <span>2,530 rows</span>
              <span aria-hidden="true">·</span>
              <span>14 columns</span>
              <span aria-hidden="true">·</span>
              <span>6 numeric</span>
              <span aria-hidden="true">·</span>
              <span>8 categorical</span>
              <span className={styles.fileStatus}>Uploaded</span>
            </div>
          </section>

          {/* Assistant message: compute animation */}
          <section className={styles.assistantMessage} aria-label="Analyzing data">
            <div className={styles.avatar} aria-hidden="true">
              <Sparkles size={12} />
            </div>
            <div className={styles.messageBody}>
              <div className={styles.messageLabel}>Agent</div>
              <p className={styles.messageLead}>
                I profiled <strong>customers.csv</strong>, typed every column, and
                flagged four data-quality issues. Here&apos;s the plan I&apos;d like to run —
                answer three quick questions below and I&apos;ll kick it off.
              </p>
              <div className={styles.computeWrap}>
                <ComputeAnimation
                  files={DEMO_FILES}
                  results={DEMO_RESULTS}
                  isComplete={true}
                  durationScale={0.75}
                />
              </div>
            </div>
          </section>

          {/* Plan card — mirrors PlanMessageCard's visual treatment */}
          <section className={styles.assistantMessage} aria-label="Proposed plan">
            <div className={styles.avatar} aria-hidden="true">
              <Sparkles size={12} />
            </div>
            <div className={styles.messageBody}>
              <div className={styles.planCard}>
                <div className={styles.planCardHeader}>
                  <span className={styles.planPath}>plans/{slugify(mockPlan.title)}.md</span>
                  <span className={styles.planBadge}>5 steps</span>
                </div>
                <div className={styles.planCardBody}>
                  <h3 className={styles.planTitle}>{mockPlan.title}</h3>
                  <ol className={styles.planSteps}>
                    {mockPlan.steps.map((step, index) => (
                      <li key={step.id} className={styles.planStep}>
                        <div className={styles.planStepCheck} aria-hidden="true">
                          <Check size={11} strokeWidth={3} />
                        </div>
                        <div className={styles.planStepBody}>
                          <div className={styles.planStepLabel}>
                            <span className={styles.planStepIndex}>
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            {step.label}
                          </div>
                          <div className={styles.planStepDesc}>{step.description}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <button type="button" className={styles.approveButton}>
                <Check size={14} aria-hidden="true" />
                Approve plan
              </button>
            </div>
          </section>

          {/* QuestionCards planner island */}
          <section className={styles.assistantMessage} aria-label="Planner questions">
            <div className={styles.avatar} aria-hidden="true">
              <Sparkles size={12} />
            </div>
            <div className={styles.messageBody}>
              <div className={styles.questionIslandFrame}>
                <QuestionCards
                  questions={PLAN_QUESTIONS}
                  onSubmit={() => {
                    /* no-op in demo mode */
                  }}
                  disabled={false}
                />
              </div>
            </div>
          </section>
        </div>

        {/* Composer — matches PlanChatPane's bottom input, read-only */}
        <div className={styles.composer}>
          <div className={styles.composerInput} aria-hidden="true">
            Ask a follow-up…
          </div>
          <div className={styles.composerHint}>
            <kbd>⏎</kbd> to send · <kbd>⇧⏎</kbd> for newline
          </div>
        </div>
      </div>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

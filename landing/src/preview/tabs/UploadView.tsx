import { Check, FileText } from 'lucide-react';
import { mockPlan } from '@/preview/fixtures/plan';
import { ComputeAnimation } from '@frontend/components/upload/ComputeAnimation';
import type { ProcessingResult } from '@frontend/types/processing';
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
    </div>
  );
}

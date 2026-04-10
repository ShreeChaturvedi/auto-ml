import { Check, FileText } from 'lucide-react';
import { mockPlan } from '@/preview/fixtures/plan';
import styles from './UploadView.module.css';

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

import { MousePointer2, Check, FileText } from 'lucide-react';
import styles from './Diorama.module.css';

export function IngestDiorama() {
  return (
    <div className={styles.frame}>
      <div className={styles.label}>1.0 INGEST — drag your data</div>
      <div className={styles.dropZone}>
        <FileText size={18} aria-hidden="true" />
        <span style={{ marginLeft: 8 }}>customers.csv</span>
        <MousePointer2 className={styles.cursorSprite} size={14} aria-hidden="true" />
      </div>
      <div className={styles.planPreview}>
        {[
          'Profile 5 datasets',
          'Join on customer_id',
          'Impute 5,432 missing values',
          'Derive 12 features',
          'Train 4 classifiers',
        ].map((text) => (
          <div key={text} className={styles.planLine}>
            <Check size={11} className={styles.planLineCheck} aria-hidden="true" />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

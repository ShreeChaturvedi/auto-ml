import styles from './Diorama.module.css';

export function PreprocessDiorama() {
  return (
    <div className={styles.frame}>
      <div className={styles.label}>3.0 PREPROCESS — fix the data</div>
      <pre className={styles.codeCell}>{`# Impute by industry median
industry_medians = (
    df.groupby('industry')['annual_revenue_usd']
      .transform('median')
)
df['annual_revenue_usd'] = (
    df['annual_revenue_usd']
      .fillna(industry_medians)
)`}</pre>
      <div className={styles.outputCell}>
        <span className={styles.outputSuccess}>✓</span> 5,432 missing values filled
      </div>
    </div>
  );
}

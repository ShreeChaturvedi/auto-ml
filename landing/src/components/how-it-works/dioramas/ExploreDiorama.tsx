import styles from './Diorama.module.css';

export function ExploreDiorama() {
  return (
    <div className={styles.frame}>
      <div className={styles.label}>2.0 EXPLORE — English → SQL</div>
      <div className={styles.queryInput}>which customers churned in Q2?</div>
      <pre className={styles.sqlBlock}>{`SELECT c.customer_id, c.company_name
FROM customers c
LEFT JOIN subscriptions s
  ON s.customer_id = c.customer_id
WHERE c.is_active = false
  AND s.end_date BETWEEN
      '2026-04-01' AND '2026-06-30'
ORDER BY c.annual_revenue_usd DESC;`}</pre>
      <div className={styles.resultBadge}>→ 1,249 rows · 0.42s</div>
    </div>
  );
}

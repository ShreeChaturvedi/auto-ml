// Hardcoded agent plan shown in the Upload tab after file ingestion completes.

export interface PlanStep {
  id: string;
  label: string;
  description: string;
  status: 'complete';
}

export const mockPlan: { title: string; steps: PlanStep[] } = {
  title: 'Churn prediction plan',
  steps: [
    {
      id: 'p1',
      label: 'Profile 5 datasets',
      description: 'customers, subscriptions, support_tickets, usage_metrics, marketing_campaigns',
      status: 'complete',
    },
    {
      id: 'p2',
      label: 'Join on customer_id',
      description: 'Customer → subscriptions + tickets + usage on customer_id',
      status: 'complete',
    },
    {
      id: 'p3',
      label: 'Impute 5,432 missing values',
      description: 'annual_revenue, resolution_hours, discount_pct, satisfaction_score',
      status: 'complete',
    },
    {
      id: 'p4',
      label: 'Derive 12 features',
      description: 'recency, frequency, monetary value, churn signals',
      status: 'complete',
    },
    {
      id: 'p5',
      label: 'Train 4 classifiers with 5-fold CV',
      description: 'logistic regression, random forest, XGBoost, LightGBM',
      status: 'complete',
    },
  ],
};

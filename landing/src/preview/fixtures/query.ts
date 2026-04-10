// Data Viewer fixtures: file tabs + per-file column schemas + row data +
// the completed English→SQL query artifact shown on the right-side panel.
//
// The Data Viewer is the first tab visitors see on load, so the fixtures
// below aim for plausible SaaS-company data rather than lorem-ipsum rows.

export type FileTabType = 'csv' | 'sql' | 'pdf';

export interface DataViewerFileTab {
  id: string;
  label: string;
  type: FileTabType;
  /** Row count shown as a small caption in the tab ("1,249 rows"). */
  rowCount?: number;
}

export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'currency';

export interface MockColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface MockDataset {
  columns: MockColumn[];
  rows: Record<string, unknown>[];
  /** Full row count (only a slice is materialized in `rows`). */
  totalRows: number;
}

// --- customers.csv ----------------------------------------------------------

const customersColumns: MockColumn[] = [
  { key: 'customer_id',        label: 'customer_id',        type: 'string' },
  { key: 'company_name',       label: 'company_name',       type: 'string' },
  { key: 'industry',           label: 'industry',           type: 'string' },
  { key: 'plan_tier',          label: 'plan_tier',          type: 'string' },
  { key: 'annual_revenue_usd', label: 'annual_revenue_usd', type: 'currency' },
  { key: 'is_active',          label: 'is_active',          type: 'boolean' },
  { key: 'signup_dt',          label: 'signup_dt',          type: 'date' },
  { key: 'country',            label: 'country',            type: 'string' },
];

const customerRows: Record<string, unknown>[] = [
  { customer_id: 'NC-01401', company_name: 'Northlight Systems', industry: 'SaaS',       plan_tier: 'Enterprise',   annual_revenue_usd: 824_500,   is_active: true,  signup_dt: '2024-02-11', country: 'US' },
  { customer_id: 'NC-01402', company_name: 'Veridian Labs',      industry: 'Healthcare', plan_tier: 'Professional', annual_revenue_usd: 312_900,   is_active: false, signup_dt: '2023-09-04', country: 'US' },
  { customer_id: 'NC-01403', company_name: 'Helix & Co.',        industry: 'Fintech',    plan_tier: 'Enterprise',   annual_revenue_usd: 961_200,   is_active: true,  signup_dt: '2022-11-28', country: 'GB' },
  { customer_id: 'NC-01404', company_name: 'Blueharbor',         industry: 'Logistics',  plan_tier: 'Starter',      annual_revenue_usd:  84_350,   is_active: true,  signup_dt: '2025-01-17', country: 'CA' },
  { customer_id: 'NC-01405', company_name: 'Kite Analytics',     industry: 'SaaS',       plan_tier: 'Professional', annual_revenue_usd: 247_800,   is_active: false, signup_dt: '2023-06-22', country: 'US' },
  { customer_id: 'NC-01406', company_name: 'Forge Studio',       industry: 'SaaS',       plan_tier: 'Starter',      annual_revenue_usd:  58_200,   is_active: true,  signup_dt: '2025-03-02', country: 'DE' },
  { customer_id: 'NC-01407', company_name: 'Meridian Supply',    industry: 'Logistics',  plan_tier: 'Enterprise',   annual_revenue_usd: 712_640,   is_active: true,  signup_dt: '2022-04-19', country: 'US' },
  { customer_id: 'NC-01408', company_name: 'Parallax Health',    industry: 'Healthcare', plan_tier: 'Professional', annual_revenue_usd: 389_110,   is_active: false, signup_dt: '2023-12-08', country: 'US' },
  { customer_id: 'NC-01409', company_name: 'Sundial Media',      industry: 'SaaS',       plan_tier: 'Professional', annual_revenue_usd: 198_540,   is_active: true,  signup_dt: '2024-08-14', country: 'AU' },
  { customer_id: 'NC-01410', company_name: 'Pivot Freight',      industry: 'Logistics',  plan_tier: 'Starter',      annual_revenue_usd:  72_900,   is_active: false, signup_dt: '2024-11-30', country: 'US' },
  { customer_id: 'NC-01411', company_name: 'Atlas Timber',       industry: 'Industrial', plan_tier: 'Professional', annual_revenue_usd: 445_800,   is_active: true,  signup_dt: '2023-03-27', country: 'CA' },
  { customer_id: 'NC-01412', company_name: 'Cobalt Robotics',    industry: 'Industrial', plan_tier: 'Enterprise',   annual_revenue_usd: 1_240_000, is_active: true,  signup_dt: '2022-07-15', country: 'US' },
  { customer_id: 'NC-01413', company_name: 'Quill & Stone',      industry: 'Retail',     plan_tier: 'Starter',      annual_revenue_usd:  41_220,   is_active: true,  signup_dt: '2025-02-09', country: 'GB' },
  { customer_id: 'NC-01414', company_name: 'Hearthline Foods',   industry: 'Retail',     plan_tier: 'Professional', annual_revenue_usd: 268_450,   is_active: false, signup_dt: '2023-10-11', country: 'US' },
  { customer_id: 'NC-01415', company_name: 'Orbital Insights',   industry: 'Fintech',    plan_tier: 'Enterprise',   annual_revenue_usd: 892_300,   is_active: true,  signup_dt: '2022-12-05', country: 'SG' },
];

export const customersDataset: MockDataset = {
  columns: customersColumns,
  rows: customerRows,
  totalRows: 8_421,
};

// --- subscriptions.csv ------------------------------------------------------

const subscriptionsColumns: MockColumn[] = [
  { key: 'subscription_id', label: 'subscription_id', type: 'string' },
  { key: 'customer_id',     label: 'customer_id',     type: 'string' },
  { key: 'plan_tier',       label: 'plan_tier',       type: 'string' },
  { key: 'start_date',      label: 'start_date',      type: 'date' },
  { key: 'end_date',        label: 'end_date',        type: 'date' },
  { key: 'amount_usd',      label: 'amount_usd',      type: 'currency' },
  { key: 'status',          label: 'status',          type: 'string' },
];

const subscriptionRows: Record<string, unknown>[] = [
  { subscription_id: 'SUB-23091', customer_id: 'NC-01401', plan_tier: 'Enterprise',   start_date: '2024-02-11', end_date: '2026-02-10', amount_usd: 824_500,   status: 'active'  },
  { subscription_id: 'SUB-23104', customer_id: 'NC-01402', plan_tier: 'Professional', start_date: '2023-09-04', end_date: '2026-05-18', amount_usd: 312_900,   status: 'churned' },
  { subscription_id: 'SUB-23155', customer_id: 'NC-01403', plan_tier: 'Enterprise',   start_date: '2022-11-28', end_date: '2025-11-27', amount_usd: 961_200,   status: 'active'  },
  { subscription_id: 'SUB-23218', customer_id: 'NC-01404', plan_tier: 'Starter',      start_date: '2025-01-17', end_date: '2026-01-16', amount_usd:  84_350,   status: 'active'  },
  { subscription_id: 'SUB-23294', customer_id: 'NC-01405', plan_tier: 'Professional', start_date: '2023-06-22', end_date: '2026-06-21', amount_usd: 247_800,   status: 'churned' },
  { subscription_id: 'SUB-23341', customer_id: 'NC-01406', plan_tier: 'Starter',      start_date: '2025-03-02', end_date: '2026-03-01', amount_usd:  58_200,   status: 'active'  },
  { subscription_id: 'SUB-23402', customer_id: 'NC-01407', plan_tier: 'Enterprise',   start_date: '2022-04-19', end_date: '2026-04-18', amount_usd: 712_640,   status: 'active'  },
  { subscription_id: 'SUB-23477', customer_id: 'NC-01408', plan_tier: 'Professional', start_date: '2023-12-08', end_date: '2026-04-29', amount_usd: 389_110,   status: 'churned' },
  { subscription_id: 'SUB-23512', customer_id: 'NC-01409', plan_tier: 'Professional', start_date: '2024-08-14', end_date: '2026-08-13', amount_usd: 198_540,   status: 'active'  },
  { subscription_id: 'SUB-23589', customer_id: 'NC-01410', plan_tier: 'Starter',      start_date: '2024-11-30', end_date: '2026-06-02', amount_usd:  72_900,   status: 'churned' },
  { subscription_id: 'SUB-23644', customer_id: 'NC-01411', plan_tier: 'Professional', start_date: '2023-03-27', end_date: '2026-03-26', amount_usd: 445_800,   status: 'active'  },
  { subscription_id: 'SUB-23701', customer_id: 'NC-01412', plan_tier: 'Enterprise',   start_date: '2022-07-15', end_date: '2026-07-14', amount_usd: 1_240_000, status: 'active'  },
];

export const subscriptionsDataset: MockDataset = {
  columns: subscriptionsColumns,
  rows: subscriptionRows,
  totalRows: 14_902,
};

// --- SQL: Q2 churn (joined result) ------------------------------------------

const sqlChurnColumns: MockColumn[] = [
  { key: 'customer_id',        label: 'customer_id',        type: 'string' },
  { key: 'company_name',       label: 'company_name',       type: 'string' },
  { key: 'plan_tier',          label: 'plan_tier',          type: 'string' },
  { key: 'end_date',           label: 'end_date',           type: 'date' },
  { key: 'annual_revenue_usd', label: 'annual_revenue_usd', type: 'currency' },
];

const sqlChurnRows: Record<string, unknown>[] = [
  { customer_id: 'NC-01412', company_name: 'Cobalt Robotics',    plan_tier: 'Enterprise',   end_date: '2026-06-28', annual_revenue_usd: 1_240_000 },
  { customer_id: 'NC-01403', company_name: 'Helix & Co.',        plan_tier: 'Enterprise',   end_date: '2026-05-02', annual_revenue_usd:   961_200 },
  { customer_id: 'NC-01415', company_name: 'Orbital Insights',   plan_tier: 'Enterprise',   end_date: '2026-06-14', annual_revenue_usd:   892_300 },
  { customer_id: 'NC-01401', company_name: 'Northlight Systems', plan_tier: 'Enterprise',   end_date: '2026-04-22', annual_revenue_usd:   824_500 },
  { customer_id: 'NC-01407', company_name: 'Meridian Supply',    plan_tier: 'Enterprise',   end_date: '2026-05-19', annual_revenue_usd:   712_640 },
  { customer_id: 'NC-01411', company_name: 'Atlas Timber',       plan_tier: 'Professional', end_date: '2026-06-03', annual_revenue_usd:   445_800 },
  { customer_id: 'NC-01408', company_name: 'Parallax Health',    plan_tier: 'Professional', end_date: '2026-04-29', annual_revenue_usd:   389_110 },
  { customer_id: 'NC-01402', company_name: 'Veridian Labs',      plan_tier: 'Professional', end_date: '2026-05-18', annual_revenue_usd:   312_900 },
  { customer_id: 'NC-01414', company_name: 'Hearthline Foods',   plan_tier: 'Professional', end_date: '2026-06-11', annual_revenue_usd:   268_450 },
  { customer_id: 'NC-01405', company_name: 'Kite Analytics',     plan_tier: 'Professional', end_date: '2026-06-21', annual_revenue_usd:   247_800 },
  { customer_id: 'NC-01409', company_name: 'Sundial Media',      plan_tier: 'Professional', end_date: '2026-05-27', annual_revenue_usd:   198_540 },
  { customer_id: 'NC-01410', company_name: 'Pivot Freight',      plan_tier: 'Starter',      end_date: '2026-06-02', annual_revenue_usd:    72_900 },
];

export const sqlChurnDataset: MockDataset = {
  columns: sqlChurnColumns,
  rows: sqlChurnRows,
  totalRows: 1_249,
};

// --- File tab registry ------------------------------------------------------

export const FILE_TAB_CUSTOMERS = 'customers_csv';
export const FILE_TAB_SUBSCRIPTIONS = 'subscriptions_csv';
export const FILE_TAB_SQL_Q2_CHURN = 'sql_q2_churn';
export const FILE_TAB_PDF_BUSINESS_CONTEXT = 'pdf_business_context';

export const mockFileTabs: DataViewerFileTab[] = [
  { id: FILE_TAB_CUSTOMERS,             label: 'customers.csv',                   type: 'csv', rowCount: customersDataset.totalRows },
  { id: FILE_TAB_SUBSCRIPTIONS,         label: 'subscriptions.csv',               type: 'csv', rowCount: subscriptionsDataset.totalRows },
  { id: FILE_TAB_SQL_Q2_CHURN,          label: 'SQL: Q2 churn',                   type: 'sql', rowCount: sqlChurnDataset.totalRows },
  { id: FILE_TAB_PDF_BUSINESS_CONTEXT,  label: 'novacraft_business_context.pdf',  type: 'pdf' },
];

export const datasetsByTabId: Record<string, MockDataset | undefined> = {
  [FILE_TAB_CUSTOMERS]: customersDataset,
  [FILE_TAB_SUBSCRIPTIONS]: subscriptionsDataset,
  [FILE_TAB_SQL_Q2_CHURN]: sqlChurnDataset,
  [FILE_TAB_PDF_BUSINESS_CONTEXT]: undefined,
};

// Data Viewer file tabs and the completed English→SQL query.

export interface DataViewerFileTab {
  id: string;
  label: string;
  type: 'csv' | 'sql' | 'pdf';
  pinned?: boolean;
}

export const mockFileTabs: DataViewerFileTab[] = [
  { id: 'customers_csv',          label: 'customers.csv',            type: 'csv' },
  { id: 'subscriptions_csv',      label: 'subscriptions.csv',        type: 'csv' },
  { id: 'sql_q2_churn',           label: 'SQL: Q2 churn',            type: 'sql', pinned: true },
  { id: 'pdf_business_context',   label: 'novacraft_business_context.pdf', type: 'pdf' },
];

export interface ColumnDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
}

export const mockCustomersColumns: ColumnDef[] = [
  { key: 'customer_id',   label: 'customer_id',   type: 'string' },
  { key: 'company_name',  label: 'company_name',  type: 'string' },
  { key: 'industry',      label: 'industry',      type: 'string' },
  { key: 'plan_tier',     label: 'plan_tier',     type: 'string' },
  { key: 'annual_revenue',label: 'annual_revenue',type: 'number' },
  { key: 'is_active',     label: 'is_active',     type: 'boolean' },
];

export const mockCustomersRows = Array.from({ length: 12 }).map((_, i) => ({
  customer_id: `NC-0${(1400 + i).toString()}`,
  company_name: [
    'Northlight Systems', 'Veridian Labs', 'Helix & Co.', 'Blueharbor', 'Kite Analytics',
    'Forge Studio', 'Meridian Supply', 'Parallax Health', 'Sundial Media', 'Pivot Freight',
    'Atlas Timber', 'Cobalt Robotics',
  ][i],
  industry: ['SaaS', 'Fintech', 'Healthcare', 'Logistics'][i % 4],
  plan_tier: ['Starter', 'Professional', 'Enterprise'][i % 3],
  annual_revenue: Math.round(80_000 + Math.random() * 920_000),
  is_active: i % 5 !== 0,
}));

export const mockSqlResultRows = mockCustomersRows.slice(0, 8).map((r) => ({
  ...r,
  is_active: false,
}));

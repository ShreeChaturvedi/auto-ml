/**
 * Script-only fixture catalog for the mock business dataset family used by
 * capture flows. Keeps parsing local to the video workspace so capture code
 * does not depend on frontend demo helpers.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type FixtureScalar = boolean | number | string | null;
export type FixtureRow = Record<string, FixtureScalar>;

export type InferredDtype =
  | "boolean"
  | "date"
  | "datetime"
  | "float"
  | "integer"
  | "string";

export type WorkflowPhaseSlug =
  | "upload"
  | "data-viewer"
  | "preprocessing"
  | "feature-engineering"
  | "training"
  | "experiments"
  | "deployment";

export type DatasetColumnProfile = {
  columnName: string;
  dtype: InferredDtype;
  nullCount: number;
};

export type MockBusinessDataset = {
  datasetId: string;
  assetKind: "raw" | "derived";
  tableName: string;
  filename: string;
  filePath: string;
  byteSize: number;
  rows: number;
  cols: number;
  columns: readonly string[];
  sampleRows: readonly FixtureRow[];
  dtypes: Readonly<Record<string, InferredDtype>>;
  nullCounts: Readonly<Record<string, number>>;
  columnProfiles: readonly DatasetColumnProfile[];
  relatedDocumentIds: readonly string[];
  description: string;
  primaryKeys: readonly string[];
  joinHints: readonly string[];
  workflowTags: readonly WorkflowPhaseSlug[];
  qualityNotes: readonly string[];
  sourceDatasetIds: readonly string[];
  sourceDocumentIds: readonly string[];
};

export type MockBusinessDocument = {
  documentId: string;
  filename: string;
  filePath: string;
  byteSize: number;
  mimeType: "application/pdf";
  title: string;
  summary: string;
};

export type MockBusinessRowsPage = {
  datasetId: string;
  tableName: string;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  rows: readonly FixtureRow[];
};

export type MockBusinessWorkflowPhase = {
  phaseSlug: WorkflowPhaseSlug;
  title: string;
  summary: string;
  focusDatasetId: string;
  datasetIds: readonly string[];
  documentIds: readonly string[];
  expectedOutputs: readonly string[];
};

export type MockBusinessFixtureCatalog = {
  rootDir: string;
  datasets: readonly MockBusinessDataset[];
  documents: readonly MockBusinessDocument[];
  datasetIds: readonly string[];
  documentIds: readonly string[];
  datasetsById: ReadonlyMap<string, MockBusinessDataset>;
  documentsById: ReadonlyMap<string, MockBusinessDocument>;
  rowsByDatasetId: ReadonlyMap<string, readonly FixtureRow[]>;
};

type InternalDatasetStore = {
  dataset: MockBusinessDataset;
  rows: readonly FixtureRow[];
};

type InternalCatalogState = {
  catalog: MockBusinessFixtureCatalog;
  datasetsById: Map<string, MockBusinessDataset>;
  documentsById: Map<string, MockBusinessDocument>;
  rowsByDatasetId: Map<string, readonly FixtureRow[]>;
  retentionDataset: MockBusinessDataset;
  retentionRows: readonly FixtureRow[];
};

type CsvMetadata = {
  description: string;
  primaryKeys: readonly string[];
  joinHints: readonly string[];
  workflowTags: readonly WorkflowPhaseSlug[];
  qualityNotes: readonly string[];
};

type CustomerUsageAgg = {
  activeMonths: number;
  featureAdoptionSum: number;
  featureAdoptionCount: number;
  latestMonth: string;
  latestActiveUsers: number;
  latestNpsResponse: number | null;
};

type CustomerSupportAgg = {
  ticketCount: number;
  satisfactionSum: number;
  satisfactionCount: number;
};

type IndustryCampaignAgg = {
  leads: number;
  conversions: number;
};

const SAMPLE_ROW_LIMIT = 5;
const DEFAULT_PAGE_SIZE = 25;
const CURRENT_FILE = fileURLToPath(import.meta.url);
const CURRENT_DIR = path.dirname(CURRENT_FILE);

export const MOCK_BUSINESS_FIXTURE_ROOT = path.resolve(
  CURRENT_DIR,
  "../../../testing/fixtures/mock-business",
);

export const MOCK_BUSINESS_DOCUMENT_ID = "mock-business-novacraft-business-context";
export const MOCK_BUSINESS_RETENTION_DATASET_ID = "mock-business-retention-matrix-v2";
export const MOCK_BUSINESS_RETENTION_FILENAME = "novacraft_retention_matrix_v2.csv";

const CSV_FILENAMES = [
  "customers.csv",
  "subscriptions.csv",
  "support_tickets.csv",
  "usage_metrics.csv",
  "marketing_campaigns.csv",
] as const;

const PDF_FILENAME = "novacraft_business_context.pdf";

const BOOLEAN_PATTERN = /^(?:true|false)$/i;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const FLOAT_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;

const RAW_DATASET_METADATA: Readonly<Record<(typeof CSV_FILENAMES)[number], CsvMetadata>> = {
  "customers.csv": {
    description:
      "Customer master table with firmographics, acquisition channel, plan tier, and churn label.",
    primaryKeys: ["customer_id"],
    joinHints: ["Join to subscriptions, usage_metrics, and support_tickets on customer_id."],
    workflowTags: [
      "upload",
      "data-viewer",
      "preprocessing",
      "feature-engineering",
      "training",
    ],
    qualityNotes: [
      "Contains duplicate rows that should be deduplicated before final training.",
      "Annual revenue and employee count contain meaningful missingness and outliers.",
    ],
  },
  "subscriptions.csv": {
    description:
      "Billing history with latest contract state, revenue, seats, discounts, and auto-renew intent.",
    primaryKeys: ["subscription_id"],
    joinHints: ["Join latest subscription per customer_id to enrich current contract state."],
    workflowTags: [
      "upload",
      "data-viewer",
      "preprocessing",
      "feature-engineering",
      "training",
    ],
    qualityNotes: [
      "Multiple rows per customer require latest-contract rollups.",
      "End dates and cancellation reasons are heavily missing for active accounts.",
    ],
  },
  "support_tickets.csv": {
    description:
      "Support workload, severity, and satisfaction signals used to explain churn pressure.",
    primaryKeys: ["ticket_id"],
    joinHints: ["Aggregate by customer_id before joining into the retention matrix."],
    workflowTags: [
      "upload",
      "data-viewer",
      "feature-engineering",
      "training",
      "experiments",
    ],
    qualityNotes: [
      "Resolution hours and satisfaction are sparse and skewed.",
      "Ticket counts should be normalized by observed active months.",
    ],
  },
  "usage_metrics.csv": {
    description:
      "Monthly adoption metrics that capture engagement, feature usage, and NPS decline over time.",
    primaryKeys: ["customer_id", "month"],
    joinHints: ["Aggregate by customer_id to produce engagement and adoption rollups."],
    workflowTags: [
      "upload",
      "data-viewer",
      "preprocessing",
      "feature-engineering",
      "training",
      "deployment",
    ],
    qualityNotes: [
      "Feature adoption and NPS are intentionally sparse for the preprocessing beat.",
      "NPS and export counts illustrate missingness and near-constant columns.",
    ],
  },
  "marketing_campaigns.csv": {
    description:
      "Campaign performance by target industry, used as external acquisition-efficiency context.",
    primaryKeys: ["campaign_id"],
    joinHints: ["Link to customers through target_industry -> industry rollups."],
    workflowTags: [
      "upload",
      "data-viewer",
      "feature-engineering",
      "training",
      "experiments",
    ],
    qualityNotes: [
      "Includes duplicate rows and missing cost_per_lead values.",
      "Campaigns connect conceptually by industry rather than direct customer foreign keys.",
    ],
  },
};

const internalCatalogState = buildMockBusinessFixtureCatalog();

export const mockBusinessFixtureCatalog = internalCatalogState.catalog;

export const MOCK_BUSINESS_WORKFLOW_PHASES: readonly MockBusinessWorkflowPhase[] =
  buildMockBusinessWorkflowPhases();

export function listMockBusinessDatasets(): readonly MockBusinessDataset[] {
  return mockBusinessFixtureCatalog.datasets;
}

export function listMockBusinessDocuments(): readonly MockBusinessDocument[] {
  return mockBusinessFixtureCatalog.documents;
}

export function listMockBusinessDatasetIds(): readonly string[] {
  return mockBusinessFixtureCatalog.datasetIds;
}

export function listMockBusinessDocumentIds(): readonly string[] {
  return mockBusinessFixtureCatalog.documentIds;
}

export function listMockBusinessWorkflowPhases(): readonly MockBusinessWorkflowPhase[] {
  return MOCK_BUSINESS_WORKFLOW_PHASES;
}

export function getMockBusinessDataset(datasetId: string): MockBusinessDataset {
  const dataset = internalCatalogState.datasetsById.get(datasetId);
  if (!dataset) {
    throw new Error(
      `[capture] unknown mock-business datasetId "${datasetId}". Known ids: ${listMockBusinessDatasetIds().join(", ")}`,
    );
  }
  return dataset;
}

export function getMockBusinessDocument(documentId: string): MockBusinessDocument {
  const document = internalCatalogState.documentsById.get(documentId);
  if (!document) {
    throw new Error(
      `[capture] unknown mock-business documentId "${documentId}". Known ids: ${listMockBusinessDocumentIds().join(", ")}`,
    );
  }
  return document;
}

export function getMockBusinessRows(datasetId: string): readonly FixtureRow[] {
  const rows = internalCatalogState.rowsByDatasetId.get(datasetId);
  if (!rows) {
    throw new Error(
      `[capture] unknown mock-business datasetId "${datasetId}". Known ids: ${listMockBusinessDatasetIds().join(", ")}`,
    );
  }
  return rows;
}

export function getMockBusinessRowsPage(
  datasetId: string,
  options: { page?: number; pageSize?: number } = {},
): MockBusinessRowsPage {
  const dataset = getMockBusinessDataset(datasetId);
  const rows = getMockBusinessRows(datasetId);
  const pageSize = clampInteger(options.pageSize, DEFAULT_PAGE_SIZE);
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = clampInteger(options.page, 1, totalPages);
  const startIndex = (page - 1) * pageSize;
  const pageRows = rows.slice(startIndex, startIndex + pageSize);

  return {
    datasetId,
    tableName: dataset.tableName,
    page,
    pageSize,
    totalRows,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    rows: pageRows,
  };
}

export function getMockBusinessRetentionDataset(): MockBusinessDataset {
  return internalCatalogState.retentionDataset;
}

export function getMockBusinessRetentionRows(): readonly FixtureRow[] {
  return internalCatalogState.retentionRows;
}

function buildMockBusinessFixtureCatalog(): InternalCatalogState {
  const documentPath = path.join(MOCK_BUSINESS_FIXTURE_ROOT, PDF_FILENAME);
  const documentStats = statSync(documentPath);
  const document: MockBusinessDocument = {
    documentId: MOCK_BUSINESS_DOCUMENT_ID,
    filename: PDF_FILENAME,
    filePath: documentPath,
    byteSize: documentStats.size,
    mimeType: "application/pdf",
    title: "NovaCraft business context",
    summary:
      "Retention-recovery brief describing the churn-risk objective, main customer segments, and demo story.",
  };

  const datasetStores = CSV_FILENAMES.map((filename) =>
    loadDataset(path.join(MOCK_BUSINESS_FIXTURE_ROOT, filename), document.documentId),
  );

  const datasets = datasetStores.map((store) => store.dataset);
  const datasetIds = datasets.map((dataset) => dataset.datasetId);
  const rowsByDatasetId = new Map(
    datasetStores.map((store) => [store.dataset.datasetId, store.rows] as const),
  );
  const datasetsById = new Map(
    datasets.map((dataset) => [dataset.datasetId, dataset] as const),
  );
  const documentsById = new Map([[document.documentId, document]]);

  const baseState: InternalCatalogState = {
    catalog: {
      rootDir: MOCK_BUSINESS_FIXTURE_ROOT,
      datasets,
      documents: [document],
      datasetIds,
      documentIds: [document.documentId],
      datasetsById,
      documentsById,
      rowsByDatasetId,
    },
    datasetsById,
    documentsById,
    rowsByDatasetId,
    retentionDataset: {
      datasetId: MOCK_BUSINESS_RETENTION_DATASET_ID,
      assetKind: "derived",
      tableName: "novacraft_retention_matrix_v2",
      filename: MOCK_BUSINESS_RETENTION_FILENAME,
      filePath: path.join(MOCK_BUSINESS_FIXTURE_ROOT, MOCK_BUSINESS_RETENTION_FILENAME),
      byteSize: 0,
      rows: 0,
      cols: 0,
      columns: [],
      sampleRows: [],
      dtypes: {},
      nullCounts: {},
      columnProfiles: [],
      relatedDocumentIds: [document.documentId],
      description: "",
      primaryKeys: [],
      joinHints: [],
      workflowTags: [],
      qualityNotes: [],
      sourceDatasetIds: [],
      sourceDocumentIds: [],
    },
    retentionRows: [],
  };

  const retentionStore = buildRetentionDataset(baseState);
  datasetsById.set(retentionStore.dataset.datasetId, retentionStore.dataset);
  rowsByDatasetId.set(retentionStore.dataset.datasetId, retentionStore.rows);

  return {
    catalog: {
      ...baseState.catalog,
      datasetIds: [...baseState.catalog.datasetIds, retentionStore.dataset.datasetId],
      datasetsById,
      rowsByDatasetId,
    },
    datasetsById,
    documentsById,
    rowsByDatasetId,
    retentionDataset: retentionStore.dataset,
    retentionRows: retentionStore.rows,
  };
}

function loadDataset(filePath: string, documentId: string): InternalDatasetStore {
  const csvText = readFileSync(filePath, "utf8");
  const { headers, records } = parseCsv(csvText);
  const tableName = path.basename(filePath, ".csv");
  const filename = path.basename(filePath) as (typeof CSV_FILENAMES)[number];
  const metadata = RAW_DATASET_METADATA[filename];
  const datasetId = `mock-business-${tableName}`;
  const byteSize = statSync(filePath).size;
  const columnProfiles = buildColumnProfiles(headers, records);
  const dtypes = Object.freeze(
    Object.fromEntries(columnProfiles.map((profile) => [profile.columnName, profile.dtype])),
  ) as Readonly<Record<string, InferredDtype>>;
  const nullCounts = Object.freeze(
    Object.fromEntries(
      columnProfiles.map((profile) => [profile.columnName, profile.nullCount]),
    ),
  ) as Readonly<Record<string, number>>;
  const rows = records.map((record) => coerceRecord(headers, record, dtypes));

  return {
    dataset: {
      datasetId,
      assetKind: "raw",
      tableName,
      filename: path.basename(filePath),
      filePath,
      byteSize,
      rows: rows.length,
      cols: headers.length,
      columns: headers,
      sampleRows: rows.slice(0, SAMPLE_ROW_LIMIT),
      dtypes,
      nullCounts,
      columnProfiles,
      relatedDocumentIds: [documentId],
      description: metadata.description,
      primaryKeys: metadata.primaryKeys,
      joinHints: metadata.joinHints,
      workflowTags: metadata.workflowTags,
      qualityNotes: metadata.qualityNotes,
      sourceDatasetIds: [datasetId],
      sourceDocumentIds: [documentId],
    },
    rows,
  };
}

function buildRetentionDataset(state: InternalCatalogState): InternalDatasetStore {
  const customersDataset = getDatasetByTableName(state, "customers");
  const subscriptionsDataset = getDatasetByTableName(state, "subscriptions");
  const supportDataset = getDatasetByTableName(state, "support_tickets");
  const usageDataset = getDatasetByTableName(state, "usage_metrics");
  const marketingDataset = getDatasetByTableName(state, "marketing_campaigns");

  const customers = getRowsByDataset(state, customersDataset.datasetId);
  const subscriptions = getRowsByDataset(state, subscriptionsDataset.datasetId);
  const supportTickets = getRowsByDataset(state, supportDataset.datasetId);
  const usageMetrics = getRowsByDataset(state, usageDataset.datasetId);
  const marketingCampaigns = getRowsByDataset(state, marketingDataset.datasetId);

  const latestSubscriptionByCustomer = new Map<string, FixtureRow>();
  for (const row of subscriptions) {
    const customerId = String(row.customer_id ?? "");
    const current = latestSubscriptionByCustomer.get(customerId);
    if (!current || String(row.start_date ?? "") > String(current.start_date ?? "")) {
      latestSubscriptionByCustomer.set(customerId, row);
    }
  }

  const usageByCustomer = new Map<string, CustomerUsageAgg>();
  for (const row of usageMetrics) {
    const customerId = String(row.customer_id ?? "");
    const month = String(row.month ?? "");
    const current = usageByCustomer.get(customerId) ?? {
      activeMonths: 0,
      featureAdoptionSum: 0,
      featureAdoptionCount: 0,
      latestMonth: "",
      latestActiveUsers: 0,
      latestNpsResponse: null,
    };

    current.activeMonths += 1;
    if (typeof row.feature_adoption_pct === "number") {
      current.featureAdoptionSum += row.feature_adoption_pct;
      current.featureAdoptionCount += 1;
    }
    if (month >= current.latestMonth) {
      current.latestMonth = month;
      current.latestActiveUsers =
        typeof row.active_users === "number" ? row.active_users : current.latestActiveUsers;
      current.latestNpsResponse =
        typeof row.nps_response === "number" ? row.nps_response : current.latestNpsResponse;
    }
    usageByCustomer.set(customerId, current);
  }

  const supportByCustomer = new Map<string, CustomerSupportAgg>();
  for (const row of supportTickets) {
    const customerId = String(row.customer_id ?? "");
    const current = supportByCustomer.get(customerId) ?? {
      ticketCount: 0,
      satisfactionSum: 0,
      satisfactionCount: 0,
    };
    current.ticketCount += 1;
    if (typeof row.satisfaction_score === "number") {
      current.satisfactionSum += row.satisfaction_score;
      current.satisfactionCount += 1;
    }
    supportByCustomer.set(customerId, current);
  }

  const campaignAggByIndustry = new Map<string, IndustryCampaignAgg>();
  let totalLeads = 0;
  let totalConversions = 0;
  for (const row of marketingCampaigns) {
    const industry = normalizeIndustryKey(row.target_industry);
    const leads = typeof row.leads_generated === "number" ? row.leads_generated : 0;
    const conversions = typeof row.conversions === "number" ? row.conversions : 0;
    const current = campaignAggByIndustry.get(industry) ?? { leads: 0, conversions: 0 };
    current.leads += leads;
    current.conversions += conversions;
    campaignAggByIndustry.set(industry, current);
    totalLeads += leads;
    totalConversions += conversions;
  }

  const overallCampaignConversionPct =
    totalLeads > 0 ? roundTo((totalConversions / totalLeads) * 100, 3) : 0;

  const rows = customers.map((customer) => {
    const customerId = String(customer.customer_id ?? "");
    const latestSubscription = latestSubscriptionByCustomer.get(customerId);
    const usage = usageByCustomer.get(customerId);
    const support = supportByCustomer.get(customerId);
    const industryKey = normalizeIndustryKey(customer.industry);
    const industryCampaignAgg =
      campaignAggByIndustry.get(industryKey) ?? campaignAggByIndustry.get("all") ?? null;
    const industryCampaignConversionPct =
      industryCampaignAgg && industryCampaignAgg.leads > 0
        ? roundTo((industryCampaignAgg.conversions / industryCampaignAgg.leads) * 100, 3)
        : overallCampaignConversionPct;
    const currentMrrUsd =
      typeof latestSubscription?.mrr_usd === "number" ? latestSubscription.mrr_usd : 0;
    const featureAdoptionPct =
      usage && usage.featureAdoptionCount > 0
        ? roundTo(usage.featureAdoptionSum / usage.featureAdoptionCount, 3)
        : 0;
    const latestNpsResponse = usage?.latestNpsResponse ?? null;
    const supportTickets = support?.ticketCount ?? 0;
    const avgSatisfaction =
      support && support.satisfactionCount > 0
        ? roundTo(support.satisfactionSum / support.satisfactionCount, 3)
        : null;
    const activeMonths = Math.max(usage?.activeMonths ?? 0, 1);
    const supportTicketVelocity = roundTo(supportTickets / activeMonths, 3);
    const expansionRatio = roundTo(
      (featureAdoptionPct / 100) * Math.log1p(Math.max(currentMrrUsd, 0)),
      3,
    );
    const campaignEfficiencyGap = roundTo(
      industryCampaignConversionPct - overallCampaignConversionPct,
      3,
    );
    const lowAdoptionPenalty = Math.max(0, 45 - featureAdoptionPct) * 0.018;
    const lowNpsPenalty =
      typeof latestNpsResponse === "number" ? Math.max(0, 7 - latestNpsResponse) * 0.11 : 0.42;
    const renewalPenalty = latestSubscription?.auto_renew === false ? 0.38 : 0;
    const cancellationPenalty =
      typeof latestSubscription?.cancellation_reason === "string" &&
      latestSubscription.cancellation_reason.length > 0
        ? 0.16
        : 0;
    const campaignPenalty = campaignEfficiencyGap < 0 ? Math.abs(campaignEfficiencyGap) * 0.05 : 0;
    const riskScore = roundTo(
      supportTicketVelocity * 0.34 +
        lowAdoptionPenalty +
        lowNpsPenalty +
        renewalPenalty +
        cancellationPenalty +
        campaignPenalty,
      3,
    );

    return {
      ...customer,
      current_mrr_usd: roundTo(currentMrrUsd, 2),
      billing_cycle:
        typeof latestSubscription?.billing_cycle === "string"
          ? latestSubscription.billing_cycle
          : null,
      seats_purchased:
        typeof latestSubscription?.seats_purchased === "number"
          ? latestSubscription.seats_purchased
          : null,
      auto_renew:
        typeof latestSubscription?.auto_renew === "boolean"
          ? latestSubscription.auto_renew
          : null,
      active_months: usage?.activeMonths ?? 0,
      latest_active_users: usage?.latestActiveUsers ?? 0,
      feature_adoption_pct: featureAdoptionPct,
      latest_nps_response: latestNpsResponse,
      support_tickets: supportTickets,
      avg_satisfaction: avgSatisfaction,
      industry_campaign_conversion_pct: industryCampaignConversionPct,
      campaign_efficiency_gap: campaignEfficiencyGap,
      support_ticket_velocity: supportTicketVelocity,
      expansion_ratio: expansionRatio,
      risk_score: riskScore,
    } satisfies FixtureRow;
  });

  const columns = Object.freeze(
    customersDataset.columns.concat([
      "current_mrr_usd",
      "billing_cycle",
      "seats_purchased",
      "auto_renew",
      "active_months",
      "latest_active_users",
      "feature_adoption_pct",
      "latest_nps_response",
      "support_tickets",
      "avg_satisfaction",
      "industry_campaign_conversion_pct",
      "campaign_efficiency_gap",
      "support_ticket_velocity",
      "expansion_ratio",
      "risk_score",
    ]),
  );
  const columnProfiles = buildColumnProfilesFromRows(columns, rows);
  const dtypes = Object.freeze(
    Object.fromEntries(columnProfiles.map((profile) => [profile.columnName, profile.dtype])),
  ) as Readonly<Record<string, InferredDtype>>;
  const nullCounts = Object.freeze(
    Object.fromEntries(
      columnProfiles.map((profile) => [profile.columnName, profile.nullCount]),
    ),
  ) as Readonly<Record<string, number>>;

  return {
    dataset: {
      datasetId: MOCK_BUSINESS_RETENTION_DATASET_ID,
      assetKind: "derived",
      tableName: "novacraft_retention_matrix_v2",
      filename: MOCK_BUSINESS_RETENTION_FILENAME,
      filePath: path.join(MOCK_BUSINESS_FIXTURE_ROOT, MOCK_BUSINESS_RETENTION_FILENAME),
      byteSize: estimateCsvByteSize(columns, rows),
      rows: rows.length,
      cols: columns.length,
      columns,
      sampleRows: rows.slice(0, SAMPLE_ROW_LIMIT),
      dtypes,
      nullCounts,
      columnProfiles,
      relatedDocumentIds: [MOCK_BUSINESS_DOCUMENT_ID],
      description:
        "Joined customer-level retention matrix built from customer, billing, support, usage, and campaign context.",
      primaryKeys: ["customer_id"],
      joinHints: [
        "Built from customers + latest subscriptions + usage rollups + support rollups + industry marketing rollups.",
      ],
      workflowTags: [
        "feature-engineering",
        "training",
        "experiments",
        "deployment",
      ],
      qualityNotes: [
        "Represents the post-preprocessing joined matrix used for training and deployment.",
        "Retains all customer rows while exposing multi-table risk features for the demo workflow.",
      ],
      sourceDatasetIds: [
        customersDataset.datasetId,
        subscriptionsDataset.datasetId,
        supportDataset.datasetId,
        usageDataset.datasetId,
        marketingDataset.datasetId,
      ],
      sourceDocumentIds: [MOCK_BUSINESS_DOCUMENT_ID],
    },
    rows,
  };
}

function buildMockBusinessWorkflowPhases(): readonly MockBusinessWorkflowPhase[] {
  const customers = getMockBusinessDataset("mock-business-customers");
  const subscriptions = getMockBusinessDataset("mock-business-subscriptions");
  const support = getMockBusinessDataset("mock-business-support_tickets");
  const usage = getMockBusinessDataset("mock-business-usage_metrics");
  const marketing = getMockBusinessDataset("mock-business-marketing_campaigns");
  const retention = getMockBusinessRetentionDataset();

  return Object.freeze([
    {
      phaseSlug: "upload",
      title: "Ingest NovaCraft source files",
      summary: "Upload all five business tables plus the business-context PDF.",
      focusDatasetId: customers.datasetId,
      datasetIds: [
        customers.datasetId,
        subscriptions.datasetId,
        support.datasetId,
        usage.datasetId,
        marketing.datasetId,
      ],
      documentIds: [MOCK_BUSINESS_DOCUMENT_ID],
      expectedOutputs: [
        "Uploaded datasets registered",
        "Business context document indexed",
        "Cross-source project plan ready for approval",
      ],
    },
    {
      phaseSlug: "data-viewer",
      title: "Explore high-risk accounts",
      summary:
        "Use natural language SQL to rank at-risk customers across customer, billing, usage, support, and campaign context.",
      focusDatasetId: customers.datasetId,
      datasetIds: [
        customers.datasetId,
        subscriptions.datasetId,
        support.datasetId,
        usage.datasetId,
        marketing.datasetId,
      ],
      documentIds: [MOCK_BUSINESS_DOCUMENT_ID],
      expectedOutputs: [
        "High-risk customer slice",
        "Generated SQL with join reasoning",
        "Cross-table churn-risk ranking",
      ],
    },
    {
      phaseSlug: "preprocessing",
      title: "Repair the most important sparsity",
      summary:
        "Clean sparse usage and subscription fields first, then validate customer join coverage before feature work.",
      focusDatasetId: usage.datasetId,
      datasetIds: [customers.datasetId, subscriptions.datasetId, usage.datasetId],
      documentIds: [MOCK_BUSINESS_DOCUMENT_ID],
      expectedOutputs: [
        "Imputed feature adoption and NPS gaps",
        "Validated latest subscription join coverage",
        "Notebook checkpoint for the joined retention matrix",
      ],
    },
    {
      phaseSlug: "feature-engineering",
      title: "Assemble the retention matrix",
      summary:
        "Join all raw NovaCraft tables into a customer-level matrix and register explainable risk features.",
      focusDatasetId: retention.datasetId,
      datasetIds: [
        customers.datasetId,
        subscriptions.datasetId,
        support.datasetId,
        usage.datasetId,
        marketing.datasetId,
        retention.datasetId,
      ],
      documentIds: [MOCK_BUSINESS_DOCUMENT_ID],
      expectedOutputs: [
        "support_ticket_velocity",
        "expansion_ratio",
        "campaign_efficiency_gap",
      ],
    },
    {
      phaseSlug: "training",
      title: "Train on the joined matrix",
      summary:
        "Compare NovaForest and XGBoost on the joined retention matrix while preserving explainability.",
      focusDatasetId: retention.datasetId,
      datasetIds: [retention.datasetId],
      documentIds: [MOCK_BUSINESS_DOCUMENT_ID],
      expectedOutputs: [
        "Champion model",
        "Calibration and SHAP artifacts",
        "Deployment-ready schema",
      ],
    },
    {
      phaseSlug: "experiments",
      title: "Review evidence",
      summary:
        "Inspect leaderboard, interpretability, errors, and provenance for the retention champion.",
      focusDatasetId: retention.datasetId,
      datasetIds: [retention.datasetId],
      documentIds: [MOCK_BUSINESS_DOCUMENT_ID],
      expectedOutputs: [
        "Leaderboard comparison",
        "Interpretability report",
        "Error analysis and provenance",
      ],
    },
    {
      phaseSlug: "deployment",
      title: "Ship the monitored endpoint",
      summary:
        "Promote the retention champion and exercise playground, API keys, logs, and drift checks.",
      focusDatasetId: retention.datasetId,
      datasetIds: [retention.datasetId],
      documentIds: [MOCK_BUSINESS_DOCUMENT_ID],
      expectedOutputs: [
        "Prediction endpoint",
        "Monitoring metrics",
        "Drift and explainability feedback",
      ],
    },
  ]);
}

function getDatasetByTableName(
  state: InternalCatalogState,
  tableName: string,
): MockBusinessDataset {
  const dataset = [...state.datasetsById.values()].find(
    (entry) => entry.assetKind === "raw" && entry.tableName === tableName,
  );
  if (!dataset) {
    throw new Error(`[capture] missing mock-business dataset for table "${tableName}"`);
  }
  return dataset;
}

function getRowsByDataset(
  state: InternalCatalogState,
  datasetId: string,
): readonly FixtureRow[] {
  const rows = state.rowsByDatasetId.get(datasetId);
  if (!rows) {
    throw new Error(`[capture] missing rows for mock-business dataset "${datasetId}"`);
  }
  return rows;
}

function buildColumnProfiles(
  headers: readonly string[],
  records: readonly (readonly string[])[],
): readonly DatasetColumnProfile[] {
  return headers.map((columnName, index) => {
    const values = records.map((record) => normalizeCell(record[index]));
    const nonNullValues = values.filter((value): value is string => value !== null);

    return {
      columnName,
      dtype: inferDtypeFromStrings(nonNullValues),
      nullCount: values.length - nonNullValues.length,
    };
  });
}

function buildColumnProfilesFromRows(
  columns: readonly string[],
  rows: readonly FixtureRow[],
): readonly DatasetColumnProfile[] {
  return columns.map((columnName) => {
    const values = rows.map((row) => row[columnName] ?? null);
    const nonNullValues = values.filter((value): value is Exclude<FixtureScalar, null> => value !== null);

    return {
      columnName,
      dtype: inferDtypeFromScalars(nonNullValues),
      nullCount: values.length - nonNullValues.length,
    };
  });
}

function inferDtypeFromStrings(values: readonly string[]): InferredDtype {
  if (values.length === 0) return "string";
  if (values.every((value) => BOOLEAN_PATTERN.test(value))) return "boolean";
  if (values.every((value) => ISO_DATETIME_PATTERN.test(value))) return "datetime";
  if (values.every((value) => ISO_DATE_PATTERN.test(value))) return "date";
  if (values.every((value) => INTEGER_PATTERN.test(value))) return "integer";
  if (values.every((value) => FLOAT_PATTERN.test(value))) return "float";
  return "string";
}

function inferDtypeFromScalars(
  values: readonly Exclude<FixtureScalar, null>[],
): InferredDtype {
  if (values.length === 0) return "string";
  if (values.every((value) => typeof value === "boolean")) return "boolean";
  if (values.every((value) => typeof value === "number" && Number.isInteger(value))) {
    return "integer";
  }
  if (values.every((value) => typeof value === "number")) return "float";
  if (values.every((value) => typeof value === "string" && ISO_DATETIME_PATTERN.test(value))) {
    return "datetime";
  }
  if (values.every((value) => typeof value === "string" && ISO_DATE_PATTERN.test(value))) {
    return "date";
  }
  return "string";
}

function coerceRecord(
  headers: readonly string[],
  record: readonly string[],
  dtypes: Readonly<Record<string, InferredDtype>>,
): FixtureRow {
  const row: FixtureRow = {};

  for (const [index, columnName] of headers.entries()) {
    const rawValue = normalizeCell(record[index]);
    const dtype = dtypes[columnName] ?? "string";
    row[columnName] = coerceValue(rawValue, dtype);
  }

  return row;
}

function coerceValue(value: string | null, dtype: InferredDtype): FixtureScalar {
  if (value === null) return null;

  switch (dtype) {
    case "boolean":
      return value.toLowerCase() === "true";
    case "integer":
    case "float":
      return Number(value);
    case "date":
    case "datetime":
    case "string":
      return value;
    default:
      return value;
  }
}

function normalizeCell(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeIndustryKey(value: FixtureScalar): string {
  const normalized = String(value ?? "all").trim().toLowerCase();
  return normalized === "all" || normalized.length === 0 ? "all" : normalized;
}

function roundTo(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function estimateCsvByteSize(
  columns: readonly string[],
  rows: readonly FixtureRow[],
): number {
  const headerLine = `${columns.join(",")}\n`;
  const body = rows
    .map((row) =>
      columns
        .map((columnName) => escapeCsvCell(row[columnName]))
        .join(","),
    )
    .join("\n");
  return Buffer.byteLength(headerLine + body, "utf8");
}

function escapeCsvCell(value: FixtureScalar): string {
  if (value === null) return "";
  const raw = String(value);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function parseCsv(csvText: string): {
  headers: readonly string[];
  records: readonly (readonly string[])[];
} {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let isQuoted = false;

  const pushCell = (): void => {
    currentRow.push(currentCell);
    currentCell = "";
  };

  const pushRow = (): void => {
    const isEmptyRow =
      currentRow.length === 1 && currentRow[0] !== undefined && currentRow[0].trim() === "";
    if (!isEmptyRow) rows.push(currentRow);
    currentRow = [];
  };

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    if (char === undefined) break;

    if (char === '"') {
      const nextChar = csvText[index + 1];
      if (isQuoted && nextChar === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      isQuoted = !isQuoted;
      continue;
    }

    if (!isQuoted && char === ",") {
      pushCell();
      continue;
    }

    if (!isQuoted && char === "\n") {
      pushCell();
      pushRow();
      continue;
    }

    if (!isQuoted && char === "\r") {
      const nextChar = csvText[index + 1];
      if (nextChar === "\n") continue;
      pushCell();
      pushRow();
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    pushCell();
    pushRow();
  }

  const [headerRow, ...recordRows] = rows;
  if (!headerRow) {
    throw new Error("[capture] mock-business fixture CSV is missing a header row");
  }

  return {
    headers: headerRow,
    records: recordRows,
  };
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  maxValue = Number.POSITIVE_INFINITY,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(1, Math.trunc(value)), maxValue);
}

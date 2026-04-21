import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { usePlanChatStore, type PlanChatEntry } from '@/stores/planChatStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore, createInitialExperimentsState } from '@/stores/experimentsStore';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { useDataStore } from '@/stores/dataStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useFeatureStore } from '@/stores/featureStore';
import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';

import type { Phase } from '@/types/phase';
import type { Project } from '@/types/project';
import type { SafeUser } from '@/types/user';
import type { UploadedFile, DataPreview, QueryArtifact } from '@/types/file';
import type { ChatMessage } from '@/types/llmUi';
import type { Notebook, NotebookCell, CellSummary } from '@/types/notebook';
import type { WorkbookEntry } from '@/types/workbook';
import type { AvailableTable } from '@/types/preprocessing';
import type { FeatureSpec } from '@/types/feature';
import type { ModelRecord } from '@/types/model';
import type { DeploymentRecord } from '@/types/deployment';
import type { FeatureLifecycleStep } from '@/stores/featureStore';
import type { TrainingRunState } from '@/stores/modelStore';

export const DEMO_PROJECT_ID = 'landing-demo-project';
const DEMO_DATASET_ID = 'landing-demo-dataset';
export const DEFAULT_PHASE: Phase = 'upload';
const NOW = '2026-04-13T15:30:00.000Z';
const DATA_VIEWER_TABS_STORAGE_KEY = 'automl-data-viewer-tabs-v1';
const TRAINING_WORKBOOKS_STORAGE_KEY = `training-workbooks-v1-${DEMO_PROJECT_ID}`;
const PREPROCESSING_WORKBOOKS_STORAGE_KEY = `preprocessing-workbooks-v1-${DEMO_PROJECT_ID}`;
const PREPROCESSING_MESSAGES_STORAGE_KEY =
  `preprocessing-messages-v5-processing-tab-1-${DEMO_PROJECT_ID}`;
const FEATURE_MESSAGES_STORAGE_KEY = 'feature-engineering-messages-v3-feature-demo-draft-v1';
const TRAINING_MESSAGES_STORAGE_KEY =
  `training-messages-v1-training-wb-1-${DEMO_PROJECT_ID}`;

const DEMO_PLANS = [
  {
    id: 'plan-retention',
    name: 'Retention Recovery Plan',
    content: '1. Target churn risk within 30 days.\n2. Prioritize support + product-adoption features.\n3. Optimize for F1 and calibration.',
  },
];

const DEMO_PROJECT: Project = {
  id: DEMO_PROJECT_ID,
  title: 'NovaCraft Growth',
  description: 'Deterministic landing-page demo project',
  icon: 'Rocket',
  color: 'cyan',
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
  unlockedPhases: [
    'upload',
    'data-viewer',
    'preprocessing',
    'feature-engineering',
    'training',
    'experiments',
    'deployment',
  ],
  currentPhase: DEFAULT_PHASE,
  completedPhases: ['upload', 'data-viewer', 'preprocessing', 'feature-engineering', 'training'],
  metadata: {
    plans: DEMO_PLANS,
    activePlanId: DEMO_PLANS[0].id,
    activePlanChatId: 'chat-retention-iteration',
    projectPlanName: DEMO_PLANS[0].name,
    projectPlan: DEMO_PLANS[0].content,
    uploadStage: 'upload',
  },
};

const DEMO_USER: SafeUser = {
  user_id: 'landing-demo-user',
  email: 'shree@novacraft.ai',
  name: 'Shree',
  role: 'admin',
  email_verified: true,
  created_at: NOW,
  updated_at: NOW,
  last_login_at: NOW,
};

const DEMO_CHAT: PlanChatEntry = {
  id: 'chat-retention-iteration',
  projectId: DEMO_PROJECT_ID,
  name: 'Iteration 2: churn objective',
  status: 'in_progress',
  messages: [
    {
      id: 'upload-user-1',
      type: 'user',
      content: 'Analyze this retention dataset and outline the fastest path to a deployable churn-risk model.',
      timestamp: new Date(NOW).getTime(),
    },
    {
      id: 'upload-assistant-1',
      type: 'assistant_text',
      content:
        'I found a clean churn-label dataset with spend, adoption, and support signals. I drafted a workflow that moves from audit to deployment without leaving this workspace.',
    },
    {
      id: 'upload-plan-1',
      type: 'plan',
      planName: 'Retention Recovery Plan',
      content: [
        '## Modeling objective',
        '- Predict churn risk within the next 30 days.',
        '',
        '## Workflow',
        '- Audit segment churn by tenure and support intensity.',
        '- Clean missing adoption signals and stabilize long-tail spend values.',
        '- Derive support velocity and expansion ratio features.',
        '- Train two classification candidates and promote the best F1 performer.',
        '- Deploy the winning model behind a monitored prediction endpoint.',
      ].join('\n'),
    },
  ],
  answerHistory: [],
  currentRound: 2,
  createdAt: new Date(NOW).getTime(),
  updatedAt: new Date(NOW).getTime(),
};

const DEMO_PREPROCESS_MESSAGES: ChatMessage[] = [
  {
    id: 'preprocess-user-1',
    type: 'user',
    content: 'Normalize spend, fill sparse adoption scores, and keep the churn label untouched.',
    timestamp: new Date(NOW).getTime(),
  },
  {
    id: 'preprocess-tool-1',
    type: 'tool_call',
    call: {
      id: 'preprocess-step-1',
      tool: 'commit_transformation_step',
      args: {
        stepId: 'prep-step-1',
        title: 'Impute adoption score and winsorize spend',
      },
    },
    result: {
      id: 'preprocess-step-1',
      tool: 'commit_transformation_step',
      output: {
        runId: 'preprocess-run-1',
        stepId: 'prep-step-1',
        status: 'applied',
      },
    },
  },
  {
    id: 'preprocess-assistant-1',
    type: 'assistant_text',
    content:
      'The preprocessing notebook applied the cleaned adoption-score fill and spend winsorization. Row counts stayed stable, and the dataset is ready for feature derivation.',
  },
];

const DEMO_FEATURE_MESSAGES: ChatMessage[] = [
  {
    id: 'feature-user-1',
    type: 'user',
    content: 'Engineer a compact set of churn features that keep the model explainable.',
    timestamp: new Date(NOW).getTime(),
  },
  {
    id: 'feature-assistant-1',
    type: 'assistant_text',
    content:
      'I prioritized two high-signal features: support ticket velocity and expansion ratio. Both improved ranking power without making the pipeline hard to audit.',
  },
];

const DEMO_TRAINING_MESSAGES: ChatMessage[] = [
  {
    id: 'training-user-1',
    type: 'user',
    content: 'Train the strongest churn classifier and keep one explainable backup.',
    timestamp: new Date(NOW).getTime(),
  },
  {
    id: 'training-tool-1',
    type: 'tool_call',
    call: {
      id: 'training-plan-1',
      tool: 'propose_training_plan',
      args: {
        experimentName: 'NovaForest Classifier',
        modelName: 'Random Forest',
      },
    },
    result: {
      id: 'training-plan-1',
      tool: 'propose_training_plan',
      output: {
        status: 'awaiting_approval',
        experimentName: 'NovaForest Classifier',
      },
    },
  },
];

const DEMO_PREVIEW: DataPreview = {
  fileId: 'landing-demo-file',
  headers: [
    'customer_id',
    'customer_tenure_months',
    'monthly_spend_usd',
    'account_tier',
    'product_adoption_score',
    'support_tickets_90d',
    'is_churned',
  ],
  rows: [
    {
      customer_id: 'NC-1001',
      customer_tenure_months: 6,
      monthly_spend_usd: 89,
      account_tier: 'starter',
      product_adoption_score: 0.42,
      support_tickets_90d: 3,
      is_churned: true,
    },
    {
      customer_id: 'NC-1002',
      customer_tenure_months: 28,
      monthly_spend_usd: 240,
      account_tier: 'pro',
      product_adoption_score: 0.86,
      support_tickets_90d: 0,
      is_churned: false,
    },
  ],
  totalRows: 2,
  previewRows: 2,
};

const DEMO_FILE: UploadedFile = {
  id: DEMO_PREVIEW.fileId,
  name: 'customers.csv',
  type: 'csv',
  size: 184_392,
  uploadedAt: new Date(NOW),
  projectId: DEMO_PROJECT_ID,
  metadata: {
    datasetId: DEMO_DATASET_ID,
    tableName: 'customers',
    queryable: true,
    rowCount: DEMO_PREVIEW.totalRows,
    columnCount: DEMO_PREVIEW.headers.length,
    columns: DEMO_PREVIEW.headers,
  },
};

const DEMO_QUERY_ARTIFACT: QueryArtifact = {
  id: 'artifact-high-risk-customers',
  name: 'High-risk customers',
  query: 'SELECT * FROM customers WHERE is_churned = true LIMIT 50',
  mode: 'sql',
  result: DEMO_PREVIEW,
  timestamp: new Date(NOW),
  isSaved: true,
  projectId: DEMO_PROJECT_ID,
};

const DEMO_STANDALONE_NOTEBOOK: Notebook = {
  notebookId: 'landing-standalone-notebook',
  projectId: DEMO_PROJECT_ID,
  name: 'Retention notebook',
  kind: 'standalone',
  metadata: {},
  createdAt: NOW,
  updatedAt: NOW,
};

const DEMO_WORKBOOKS: Record<'preprocessing' | 'feature-engineering' | 'training', WorkbookEntry[]> = {
  preprocessing: [
    {
      id: 'processing-tab-1',
      name: 'Workbook 1',
      notebookId: 'preprocess-demo-processing-tab-1',
    },
    {
      id: 'processing-tab-2',
      name: 'Workbook 2',
      notebookId: 'preprocess-demo-processing-tab-2',
    },
  ],
  'feature-engineering': [
    {
      id: 'feature-demo-draft-v1',
      name: 'Draft Pipeline v1',
      notebookId: 'feature-demo-feature-demo-draft-v1',
    },
  ],
  training: [
    {
      id: 'training-wb-1',
      name: 'Workbook 1',
      notebookId: 'training-demo-training-wb-1',
    },
  ],
};

const DEMO_PHASE_NOTEBOOKS: Notebook[] = [
  {
    notebookId: 'preprocess-demo-processing-tab-1',
    projectId: DEMO_PROJECT_ID,
    name: 'Workbook 1',
    kind: 'phase',
    metadata: {
      phase: 'preprocessing',
      tabId: 'processing-tab-1',
      tabName: 'Workbook 1',
    },
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    notebookId: 'preprocess-demo-processing-tab-2',
    projectId: DEMO_PROJECT_ID,
    name: 'Workbook 2',
    kind: 'phase',
    metadata: {
      phase: 'preprocessing',
      tabId: 'processing-tab-2',
      tabName: 'Workbook 2',
    },
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    notebookId: 'feature-demo-feature-demo-draft-v1',
    projectId: DEMO_PROJECT_ID,
    name: 'Draft Pipeline v1',
    kind: 'phase',
    metadata: {
      phase: 'feature-engineering',
      tabId: 'feature-demo-draft-v1',
      tabName: 'Draft Pipeline v1',
    },
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    notebookId: 'training-demo-training-wb-1',
    projectId: DEMO_PROJECT_ID,
    name: 'Workbook 1',
    kind: 'phase',
    metadata: {
      phase: 'training',
      tabId: 'training-wb-1',
      tabName: 'Workbook 1',
    },
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const DEMO_NOTEBOOKS: Notebook[] = [DEMO_STANDALONE_NOTEBOOK, ...DEMO_PHASE_NOTEBOOKS];

const DEMO_TABLES: AvailableTable[] = [
  {
    datasetId: DEMO_DATASET_ID,
    name: 'Customer retention',
    filename: 'customers.csv',
    sizeBytes: 184_392,
    nRows: DEMO_PREVIEW.totalRows,
    nCols: DEMO_PREVIEW.headers.length,
  },
];

const DEMO_MODELS: ModelRecord[] = [
  {
    modelId: 'model-novaforest',
    projectId: DEMO_PROJECT_ID,
    datasetId: DEMO_DATASET_ID,
    name: 'NovaForest Classifier',
    templateId: 'rf',
    taskType: 'classification',
    library: 'sklearn',
    algorithm: 'Random Forest',
    parameters: { n_estimators: 400, max_depth: 12, min_samples_leaf: 4 },
    metrics: { accuracy: 0.9142, precision: 0.8611, recall: 0.8245, f1: 0.8424, auc: 0.9318 },
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    trainingMs: 94_000,
    targetColumn: 'is_churned',
  },
  {
    modelId: 'model-xgboost',
    projectId: DEMO_PROJECT_ID,
    datasetId: DEMO_DATASET_ID,
    name: 'XGBoost Retention',
    templateId: 'xgb',
    taskType: 'classification',
    library: 'xgboost',
    algorithm: 'XGBoost',
    parameters: { max_depth: 6, learning_rate: 0.08, n_estimators: 320 },
    metrics: { accuracy: 0.9073, precision: 0.8541, recall: 0.8119, f1: 0.8324, auc: 0.9282 },
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    trainingMs: 73_000,
    targetColumn: 'is_churned',
  },
];

const DEMO_DEPLOYMENT: DeploymentRecord = {
  deploymentId: 'deploy-churn-champion',
  modelId: DEMO_MODELS[0].modelId,
  projectId: DEMO_PROJECT_ID,
  name: 'churn-champion',
  status: 'healthy',
  endpointUrl: 'https://api.agentic.dev/v1/deployments/churn-champion',
  config: {},
  createdAt: '2026-04-10T14:00:00.000Z',
  updatedAt: NOW,
};

const DEMO_FEATURES: FeatureSpec[] = [
  {
    id: 'feature-support-ticket-velocity',
    projectId: DEMO_PROJECT_ID,
    versionId: 'feature-demo-draft-v1',
    sourceColumn: 'support_tickets_90d',
    featureName: 'support_ticket_velocity',
    description: 'Normalizes 90-day support volume against customer tenure.',
    method: 'ratio',
    category: 'interaction',
    params: {
      denominatorColumn: 'customer_tenure_months',
      floor: 1,
    },
    enabled: true,
    createdAt: NOW,
    code: [
      "df['support_ticket_velocity'] =",
      "  df['support_tickets_90d'] / df['customer_tenure_months'].clip(lower=1)",
    ].join('\n'),
  },
  {
    id: 'feature-expansion-ratio',
    projectId: DEMO_PROJECT_ID,
    versionId: 'feature-demo-draft-v1',
    sourceColumn: 'monthly_spend_usd',
    secondaryColumn: 'product_adoption_score',
    featureName: 'expansion_ratio',
    description: 'Blends spend intensity with adoption depth to surface expansion-ready accounts.',
    method: 'product',
    category: 'interaction',
    params: {
      secondaryColumn: 'product_adoption_score',
    },
    enabled: true,
    createdAt: NOW,
    code:
      "df['expansion_ratio'] = df['monthly_spend_usd'] * df['product_adoption_score']",
  },
];

const DEMO_FEATURE_STEPS: Record<string, FeatureLifecycleStep> = {
  'feature-support-ticket-velocity': {
    stepId: 'feature-support-ticket-velocity',
    name: 'Derive support ticket velocity',
    method: 'ratio',
    status: 'registered',
    code: DEMO_FEATURES[0].code,
    metrics: {
      deltaRecall: 0.031,
      deltaF1: 0.018,
    },
  },
  'feature-expansion-ratio': {
    stepId: 'feature-expansion-ratio',
    name: 'Blend spend and adoption into expansion ratio',
    method: 'product',
    status: 'registered',
    code: DEMO_FEATURES[1].code,
    metrics: {
      deltaPrecision: 0.022,
      deltaF1: 0.013,
    },
  },
};

const DEMO_TRAINING_RUN_STATES: Record<string, TrainingRunState> = {
  'experiment-novaforest': {
    experimentId: 'experiment-novaforest',
    experimentName: 'NovaForest Classifier',
    modelType: 'Random Forest',
    status: 'registered',
    metrics: DEMO_MODELS[0].metrics,
    hyperparameters: DEMO_MODELS[0].parameters,
  },
  'experiment-xgboost': {
    experimentId: 'experiment-xgboost',
    experimentName: 'XGBoost Retention',
    modelType: 'XGBoost',
    status: 'evaluated',
    metrics: DEMO_MODELS[1].metrics,
    hyperparameters: DEMO_MODELS[1].parameters,
  },
};

function createNotebookCell(
  notebookId: string,
  cellId: string,
  position: number,
  cellType: NotebookCell['cellType'],
  content: string,
  output: NotebookCell['output'] = [],
): NotebookCell {
  return {
    cellId,
    notebookId,
    cellType,
    content,
    position,
    metadata: {},
    executionCount: output.length > 0 ? 1 : 0,
    executionOrder: output.length > 0 ? position + 1 : null,
    executionStatus: output.length > 0 ? 'success' : 'idle',
    executionDurationMs: output.length > 0 ? 2400 : null,
    executedAt: output.length > 0 ? NOW : null,
    isDirty: false,
    output,
    outputRefs: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function cloneNotebook(notebook: Notebook): Notebook {
  return {
    ...notebook,
    metadata: { ...(notebook.metadata ?? {}) },
  };
}

function cloneNotebookCell(cell: NotebookCell): NotebookCell {
  return {
    ...cell,
    metadata: { ...(cell.metadata ?? {}) },
    output: cell.output.map((entry) => ({
      ...entry,
      data: entry.data ? { ...entry.data } : undefined,
    })),
    outputRefs: cell.outputRefs.map((entry) => ({ ...entry })),
  };
}

function buildCellSummaries(cells: NotebookCell[]): CellSummary[] {
  return cells.map((cell) => ({
    cellId: cell.cellId,
    cellType: cell.cellType,
    title: cell.title ?? null,
    position: cell.position,
    executionStatus: cell.executionStatus,
    executionCount: cell.executionCount,
    executionOrder: cell.executionOrder ?? null,
    isDirty: cell.isDirty,
    lockedBy: cell.lockedBy ?? null,
    contentPreview: cell.content.slice(0, 120),
  }));
}

const DEMO_NOTEBOOK_CELLS: Record<string, NotebookCell[]> = {
  'landing-standalone-notebook': [
    createNotebookCell(
      'landing-standalone-notebook',
      'standalone-note-1',
      0,
      'markdown',
      '# Retention notebook\n\nQuick SQL checks on the uploaded retention dataset.',
    ),
  ],
  'preprocess-demo-processing-tab-1': [
    createNotebookCell(
      'preprocess-demo-processing-tab-1',
      'preprocess-md-1',
      0,
      'markdown',
      '## Preprocessing audit\n\nImpute sparse adoption scores, clip extreme spend outliers, and preserve label integrity.',
    ),
    createNotebookCell(
      'preprocess-demo-processing-tab-1',
      'preprocess-code-1',
      1,
      'code',
      [
        "df['product_adoption_score'] = df['product_adoption_score'].fillna(",
        "    df.groupby('account_tier')['product_adoption_score'].transform('median')",
        ')',
        "df['monthly_spend_usd'] = df['monthly_spend_usd'].clip(upper=450)",
      ].join('\n'),
      [
        {
          type: 'text',
          content:
            'Filled 128 sparse adoption scores and clipped 14 extreme spend outliers without changing row counts.',
        },
      ],
    ),
  ],
  'preprocess-demo-processing-tab-2': [
    createNotebookCell(
      'preprocess-demo-processing-tab-2',
      'preprocess-code-2',
      0,
      'code',
      "df['support_tickets_90d'] = df['support_tickets_90d'].fillna(0)",
      [{ type: 'text', content: 'Support-ticket sparsity removed for replay-safe downstream features.' }],
    ),
  ],
  'feature-demo-feature-demo-draft-v1': [
    createNotebookCell(
      'feature-demo-feature-demo-draft-v1',
      'feature-md-1',
      0,
      'markdown',
      '## Feature notebook\n\nDrafting compact churn features that stay explainable in the experiments view.',
    ),
    createNotebookCell(
      'feature-demo-feature-demo-draft-v1',
      'feature-code-1',
      1,
      'code',
      [
        "df['support_ticket_velocity'] =",
        "    df['support_tickets_90d'] / df['customer_tenure_months'].clip(lower=1)",
        "df['expansion_ratio'] = df['monthly_spend_usd'] * df['product_adoption_score']",
      ].join('\n'),
      [
        {
          type: 'text',
          content:
            'Registered 2 candidate features. Validation improved recall by 3.1 points while keeping the feature set explainable.',
        },
      ],
    ),
  ],
  'training-demo-training-wb-1': [
    createNotebookCell(
      'training-demo-training-wb-1',
      'training-md-1',
      0,
      'markdown',
      '## Training run\n\nComparing a Random Forest champion against an explainable XGBoost backup.',
    ),
    createNotebookCell(
      'training-demo-training-wb-1',
      'training-code-1',
      1,
      'code',
      [
        "champion = train_model('random_forest', target='is_churned')",
        "backup = train_model('xgboost', target='is_churned')",
        'compare_models([champion, backup])',
      ].join('\n'),
      [
        {
          type: 'text',
          content:
            'Champion: NovaForest Classifier | F1 0.8424 | Precision 0.8611 | Recall 0.8245',
        },
      ],
    ),
  ],
};

function getDemoNotebookById(notebookId: string | null | undefined): Notebook | null {
  if (!notebookId) {
    return null;
  }
  const notebook = DEMO_NOTEBOOKS.find((entry) => entry.notebookId === notebookId);
  return notebook ? cloneNotebook(notebook) : null;
}

function getDemoCellsForNotebook(notebookId: string | null | undefined): NotebookCell[] {
  if (!notebookId) {
    return [];
  }
  return (DEMO_NOTEBOOK_CELLS[notebookId] ?? []).map(cloneNotebookCell);
}

function activateDemoNotebook(notebookId: string | null | undefined) {
  const resolvedNotebook = getDemoNotebookById(notebookId);
  const cells = getDemoCellsForNotebook(resolvedNotebook?.notebookId);
  useNotebookStore.setState({
    activeNotebookId: resolvedNotebook?.notebookId ?? null,
    notebook: resolvedNotebook,
    cells,
    cellSummaries: buildCellSummaries(cells),
  });
}

function persistStoredConversation(storageKey: string, messages: ChatMessage[]) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: 2,
      messages,
      savepoints: {},
    }),
  );
}

function cloneProject(): Project {
  return {
    ...DEMO_PROJECT,
    unlockedPhases: [...DEMO_PROJECT.unlockedPhases],
    completedPhases: [...DEMO_PROJECT.completedPhases],
    metadata: { ...(DEMO_PROJECT.metadata ?? {}) },
  };
}

function updateProjectState(updater: (project: Project) => Project) {
  useProjectStore.setState((state) => ({
    projects: state.projects.map((project) => (
      project.id === DEMO_PROJECT_ID ? updater(project) : project
    )),
  }));
}

function resetLandingDemoStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    DATA_VIEWER_TABS_STORAGE_KEY,
    JSON.stringify({
      state: {
        openFileTabs: [
          { id: DEMO_FILE.id, type: 'file' },
          { id: DEMO_QUERY_ARTIFACT.id, type: 'artifact' },
        ],
        activeFileTabId: DEMO_FILE.id,
        fileTabType: 'file',
      },
      version: 1,
    }),
  );

  window.localStorage.setItem(
    TRAINING_WORKBOOKS_STORAGE_KEY,
    JSON.stringify({
      activeWorkbookId: 'training-wb-1',
      workbooks: [{ id: 'training-wb-1', name: 'Workbook 1', notebookId: 'training-demo-training-wb-1' }],
    }),
  );

  window.localStorage.setItem(
    PREPROCESSING_WORKBOOKS_STORAGE_KEY,
    JSON.stringify({
      activeTabId: 'processing-tab-1',
      nextDefaultWorkbookIndex: 3,
      tabs: [
        {
          id: 'processing-tab-1',
          name: 'Workbook 1',
          storageVersion: 1,
          notebookId: 'preprocess-demo-processing-tab-1',
          selectedDatasetId: DEMO_DATASET_ID,
        },
        {
          id: 'processing-tab-2',
          name: 'Workbook 2',
          storageVersion: 1,
          notebookId: 'preprocess-demo-processing-tab-2',
          selectedDatasetId: DEMO_DATASET_ID,
        },
      ],
    }),
  );

  persistStoredConversation(PREPROCESSING_MESSAGES_STORAGE_KEY, DEMO_PREPROCESS_MESSAGES);
  persistStoredConversation(FEATURE_MESSAGES_STORAGE_KEY, DEMO_FEATURE_MESSAGES);
  persistStoredConversation(TRAINING_MESSAGES_STORAGE_KEY, DEMO_TRAINING_MESSAGES);
}

export function resetLandingDemoState() {
  resetLandingDemoStorage();

  useProjectStore.setState({
    projects: [cloneProject()],
    activeProjectId: DEMO_PROJECT_ID,
    isInitialized: true,
    isLoading: false,
    error: undefined,
    initialize: async () => {},
    createProject: async () => cloneProject(),
    updateProject: async (id, data) => {
      let nextProject: Project | undefined;
      updateProjectState((project) => {
        if (project.id !== id) {
          return project;
        }
        nextProject = {
          ...project,
          ...data,
          metadata: data.metadata
            ? { ...(project.metadata ?? {}), ...data.metadata }
            : project.metadata,
        };
        return nextProject;
      });
      return nextProject;
    },
    deleteProject: async () => {},
    setActiveProject: (id) => {
      useProjectStore.setState({ activeProjectId: id });
    },
    getActiveProject: () => useProjectStore.getState().projects.find((project) => project.id === DEMO_PROJECT_ID),
    getProjectById: (id) => useProjectStore.getState().projects.find((project) => project.id === id),
    setCurrentPhase: (projectId, phase) => {
      updateProjectState((project) => (
        project.id === projectId ? { ...project, currentPhase: phase } : project
      ));
    },
    unlockPhase: (projectId, phase) => {
      updateProjectState((project) => (
        project.id === projectId && !project.unlockedPhases.includes(phase)
          ? { ...project, unlockedPhases: [...project.unlockedPhases, phase] }
          : project
      ));
    },
    completePhase: (projectId, phase) => {
      updateProjectState((project) => (
        project.id === projectId && !project.completedPhases.includes(phase)
          ? { ...project, completedPhases: [...project.completedPhases, phase] }
          : project
      ));
    },
    isPhaseUnlocked: (projectId, phase) => {
      const project = useProjectStore.getState().projects.find((entry) => entry.id === projectId);
      return Boolean(project?.unlockedPhases.includes(phase));
    },
    isPhaseCompleted: (projectId, phase) => {
      const project = useProjectStore.getState().projects.find((entry) => entry.id === projectId);
      return Boolean(project?.completedPhases.includes(phase));
    },
  });

  useAuthStore.setState({
    user: DEMO_USER,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });

  usePlanChatStore.setState({
    chats: { [DEMO_CHAT.id]: DEMO_CHAT },
    isInitialized: true,
    initializedProjectId: DEMO_PROJECT_ID,
    initialize: async () => {},
    createChat: async () => DEMO_CHAT,
    renameChat: async () => {},
    completeChat: async () => {},
    deleteChat: async () => {},
    persistChatState: async () => {},
    loadFullChat: async () => DEMO_CHAT,
    getInProgressChats: () => [DEMO_CHAT],
  });

  useWorkbookRegistryStore.setState({
    preprocessing: DEMO_WORKBOOKS.preprocessing,
    'feature-engineering': DEMO_WORKBOOKS['feature-engineering'],
    training: DEMO_WORKBOOKS.training,
    deleteHandlers: {},
  });

  useModelStore.setState({
    templates: [],
    models: DEMO_MODELS,
    isLoadingTemplates: false,
    isLoadingModels: false,
    isTraining: false,
    error: null,
    trainingRunStates: DEMO_TRAINING_RUN_STATES,
    currentStage: 'register_model',
    trainingRunId: 'training-run-demo-1',
    fetchTemplates: async () => {},
    refreshModels: async () => {},
    trainModel: async () => null,
    updateTrainingRun: () => {},
    setCurrentStage: () => {},
    setTrainingRunId: () => {},
    deleteModel: async () => {},
    clearTrainingRun: () => {},
  });

  useExperimentsStore.setState({
    ...createInitialExperimentsState(),
    selectedModelId: null,
    comparisonModelIds: [DEMO_MODELS[0].modelId, DEMO_MODELS[1].modelId],
    experimentView: 'leaderboard',
    sortField: 'f1',
    sortDirection: 'desc',
    fetchEvaluation: async () => {},
    fetchShap: async () => {},
    fetchErrorAnalysis: async () => {},
    fetchReport: async () => {},
    fetchCompareNarrative: async () => {},
    retryEvaluation: async () => {},
  });

  useDeploymentStore.setState({
    deployments: [DEMO_DEPLOYMENT],
    selectedDeploymentId: DEMO_DEPLOYMENT.deploymentId,
    isLoading: false,
    error: null,
    refreshDeployments: async () => {},
    selectDeployment: (id) => useDeploymentStore.setState({ selectedDeploymentId: id }),
    deploy: async () => DEMO_DEPLOYMENT,
    stop: async () => {},
    start: async () => {},
    restart: async () => {},
    remove: async () => {},
    updateDeploymentStatus: (id, status, errorMessage) => {
      useDeploymentStore.setState((state) => ({
        deployments: state.deployments.map((deployment) => (
          deployment.deploymentId === id ? { ...deployment, status, errorMessage } : deployment
        )),
      }));
    },
  });

  useDataStore.setState({
    files: [DEMO_FILE],
    previews: [DEMO_PREVIEW],
    queryArtifacts: [DEMO_QUERY_ARTIFACT],
    activeArtifactId: DEMO_QUERY_ARTIFACT.id,
    queryCounter: 1,
    hydrationError: null,
    hydratedProjects: new Set([DEMO_PROJECT_ID]),
    isHydrating: false,
    recentlyDeletedIds: new Set(),
    activeFileTabId: DEMO_FILE.id,
    fileTabType: 'file',
    openFileTabs: [
      { id: DEMO_FILE.id, type: 'file' },
      { id: DEMO_QUERY_ARTIFACT.id, type: 'artifact' },
    ],
    hydrateFromBackend: async () => {},
    updateColumnType: async () => {},
    deleteFile: async () => {},
    markDeleted: () => {},
  });

  usePreprocessingStore.setState({
    activeProjectId: DEMO_PROJECT_ID,
    tables: DEMO_TABLES,
    selectedDatasetId: DEMO_DATASET_ID,
    runId: 'preprocess-run-1',
    nextRunCellMode: 'continue',
    latestCheckpointId: null,
    assistantMessages: [
      {
        id: 'preprocess-assistant-message-1',
        role: 'assistant',
        content:
          'Applied adoption-score imputation and spend clipping. The cleaned dataset is stable for downstream feature work.',
      },
    ],
    timeline: [
      {
        id: 'preprocess-event-1',
        runId: 'preprocess-run-1',
        stepId: 'prep-step-1',
        toolName: 'commit_transformation_step',
        title: 'Impute adoption score and winsorize spend',
        status: 'applied',
        rationale:
          'Account-tier medians preserve segment behavior while taming extreme monthly spend outliers.',
        intentType: 'impute_missing',
        cellIds: ['preprocess-code-1'],
        validation: {
          rowCountBefore: DEMO_PREVIEW.totalRows,
          rowCountAfter: DEMO_PREVIEW.totalRows,
          schemaDrift: false,
          notes: 'No rows dropped; churn label preserved.',
        },
        requiresApproval: false,
        createdAt: new Date(NOW).getTime(),
        updatedAt: new Date(NOW).getTime(),
      },
    ],
    stepBindings: {
      'prep-step-1': {
        stepId: 'prep-step-1',
        cellIds: ['preprocess-code-1'],
        lastSyncedAt: new Date(NOW).getTime(),
      },
    },
    replayReport: null,
    controllerSummary: null,
    isLoadingTables: false,
    error: null,
    loadTables: async () => {},
    hydrateRunById: async () => {},
    evaluateReplayCompatibility: async () => {},
  });

  useFeatureStore.setState({
    features: DEMO_FEATURES,
    versions: {
      [DEMO_PROJECT_ID]: [
        {
          id: 'feature-demo-draft-v1',
          projectId: DEMO_PROJECT_ID,
          name: 'Draft Pipeline v1',
          status: 'draft',
          createdAt: NOW,
          notebookId: 'feature-demo-feature-demo-draft-v1',
          readinessReport: {
            dataSummary: {
              addedColumns: ['support_ticket_velocity', 'expansion_ratio'],
              removedColumns: [],
              renamedColumns: [],
              typeChanges: [],
              nullDeltas: [],
              warnings: [],
            },
            steps: [
              {
                id: 'feature-step-1',
                name: 'Derive support ticket velocity',
                rationale: 'Normalize support demand over time before model training.',
                columns: ['support_tickets_90d'],
              },
            ],
          },
        },
      ],
    },
    currentVersionId: { [DEMO_PROJECT_ID]: 'feature-demo-draft-v1' },
    featureSteps: DEMO_FEATURE_STEPS,
    currentStage: 'register_feature',
    featureRunId: 'feature-run-demo-1',
    syncFeaturesToProject: async () => {},
    hydrateFromProject: () => {},
  });

  useNlSuggestionStore.setState({
    byProject: {
      [DEMO_PROJECT_ID]: {
        suggestions: [],
        schemaFingerprint: '',
      },
    },
  });

  useNotebookStore.setState({
    currentProjectId: DEMO_PROJECT_ID,
    notebooks: DEMO_NOTEBOOKS.map(cloneNotebook),
    activeNotebookId: DEMO_STANDALONE_NOTEBOOK.notebookId,
    notebook: cloneNotebook(DEMO_STANDALONE_NOTEBOOK),
    cells: getDemoCellsForNotebook(DEMO_STANDALONE_NOTEBOOK.notebookId),
    cellSummaries: buildCellSummaries(
      getDemoCellsForNotebook(DEMO_STANDALONE_NOTEBOOK.notebookId),
    ),
    lockedCells: new Map(),
    runAllRunningCellId: null,
    isLoading: false,
    isConnecting: false,
    isSaving: false,
    isConnected: false,
    wsClient: null,
    error: null,
    suggestedCellIds: new Set(),
    streamingCellIds: new Set(),
    streamErrors: new Map(),
    streamAbortControllers: new Map(),
    initializeNotebook: async (projectId, notebookId) => {
      useNotebookStore.setState({
        currentProjectId: projectId,
        notebooks: DEMO_NOTEBOOKS.map(cloneNotebook),
      });
      activateDemoNotebook(notebookId ?? useNotebookStore.getState().activeNotebookId);
    },
    disconnect: () => {},
    loadNotebooks: async (projectId) => {
      useNotebookStore.setState({
        currentProjectId: projectId ?? DEMO_PROJECT_ID,
        notebooks: DEMO_NOTEBOOKS.map(cloneNotebook),
      });
    },
    setActiveNotebook: async (notebookId) => {
      activateDemoNotebook(notebookId);
    },
    createNotebook: async () => cloneNotebook(DEMO_STANDALONE_NOTEBOOK),
    renameNotebook: async (notebookId, name) => {
      let renamed: Notebook | null = null;
      useNotebookStore.setState((state) => ({
        notebooks: state.notebooks.map((notebook) => {
          if (notebook.notebookId !== notebookId) {
            return notebook;
          }
          renamed = { ...notebook, name };
          return renamed;
        }),
        notebook: state.notebook?.notebookId === notebookId && renamed ? renamed : state.notebook,
      }));
      return renamed;
    },
    deleteNotebook: async () => true,
    updateNotebookMetadata: async (notebookId, metadata) => {
      let updated: Notebook | null = null;
      useNotebookStore.setState((state) => ({
        notebooks: state.notebooks.map((entry) => {
          if (entry.notebookId !== notebookId) {
            return entry;
          }
          updated = {
            ...entry,
            metadata: { ...(entry.metadata ?? {}), ...metadata },
          };
          return updated;
        }),
        notebook:
          state.notebook?.notebookId === notebookId && updated ? updated : state.notebook,
      }));
      return updated;
    },
    loadCells: async () => {
      activateDemoNotebook(useNotebookStore.getState().activeNotebookId);
    },
    loadCell: async () => null,
    createCell: async () => null,
    updateCell: async () => null,
    deleteCell: async () => false,
    reorderCells: async () => false,
    runCell: async () => {},
    runAllCells: async () => {},
    stopRunAllCells: async () => {},
    getCellLock: async () => null,
    isCellLocked: () => false,
    getCellLockOwner: () => null,
    updateCellLocally: () => {},
    removeCellLocally: () => {},
    setCellLock: () => {},
    clearCellLock: () => {},
    setError: (error) => useNotebookStore.setState({ error }),
    startSuggestedCellStream: async () => {},
    acceptSuggestedCell: () => {},
    rejectSuggestedCell: async () => {},
    cancelSuggestedCellStream: () => {},
    reset: () => {},
  });
}

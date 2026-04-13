import { useEffect, useMemo, useState } from 'react';
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LayoutDashboard, Check } from 'lucide-react';

import { AppShell } from '@/components/layout/AppShell';
import { ThemeProvider } from '@/components/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QuestionCards } from '@/components/upload/QuestionCards';
import { DataTable } from '@/components/data/DataTable';
import { OverviewColumnCards } from '@/components/data/eda/OverviewColumnCards';
import { PreprocessingToolbarLeft, PreprocessingToolbarRight } from '@/components/preprocessing/PreprocessingToolbar';
import { FeatureApprovalGate } from '@/components/features/FeatureApprovalGate';
import { FeatureSuggestionCard } from '@/components/features/FeatureSuggestionCard';
import { TrainingProgressCard, type MetricSeries } from '@/components/training/TrainingProgressCard';
import { ModelRecommendationCard } from '@/components/training/ModelRecommendationCard';
import { NotebookCellOutput } from '@/components/notebook/NotebookCellOutput';
import { Leaderboard } from '@/components/experiments/Leaderboard';
import { IconModeToggle } from '@/components/data/IconModeToggle';
import { DeploymentDetail } from '@/components/deployment/DeploymentDetail';
import { useProjectStore } from '@/stores/projectStore';
import { useAuthStore } from '@/stores/authStore';
import { usePlanChatStore } from '@/stores/planChatStore';
import { useWorkbookRegistryStore } from '@/stores/workbookRegistryStore';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore, createInitialExperimentsState } from '@/stores/experimentsStore';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { useDataStore } from '@/stores/dataStore';
import { useNotebookStore } from '@/stores/notebookStore';
import type { AskUserQuestion, Control } from '@/types/llmUi';
import type { DataPreview, EdaSummary, UploadedFile } from '@/types/file';
import type { WorkbookEntry } from '@/types/workbook';
import type { FeatureSuggestionItem } from '@/components/features/featureEngineeringUtils';
import type { ModelRecord } from '@/types/model';
import type { DeploymentRecord } from '@/types/deployment';
import type { Project } from '@/types/project';
import type { Phase } from '@/types/phase';
import type { Notebook } from '@/types/notebook';
import type { SafeUser } from '@/types/user';
import type { AvailableTable } from '@/types/preprocessing';
import type { RichOutput } from '@/lib/api/execution';
import { WORKFLOW_PHASES, phaseConfig } from '@/types/phase';
import { getLucideIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

const DEMO_PROJECT_ID = 'landing-demo-project';
const DEFAULT_PHASE: Phase = 'data-viewer';
const NOW = '2026-04-13T15:30:00.000Z';

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
  metadata: {},
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

const DEMO_PLAN_QUESTIONS: AskUserQuestion[] = [
  {
    id: 'target',
    header: 'Target',
    question: "What's your target variable?",
    type: 'single_select',
    allowCustom: false,
    options: [
      { label: 'is_churned', description: 'Customer attrition label' },
      { label: 'expansion_mrr', description: 'Net revenue expansion' },
      { label: 'nps_bucket', description: 'Satisfaction segment' },
    ],
  },
  {
    id: 'task',
    header: 'Task',
    question: 'Which modeling task should the agent optimize for?',
    type: 'single_select',
    allowCustom: false,
    options: [
      { label: 'Classification', description: 'Predict a class label' },
      { label: 'Regression', description: 'Predict a continuous value' },
      { label: 'Forecasting', description: 'Model change over time' },
    ],
  },
  {
    id: 'compute',
    header: 'Compute',
    question: 'How much search budget should it use?',
    type: 'single_select',
    allowCustom: false,
    options: [
      { label: 'Quick', description: 'Fast read on the signal' },
      { label: 'Standard', description: 'Balanced quality and speed' },
      { label: 'Deep', description: 'Thorough hyperparameter search' },
    ],
  },
];

const DEMO_EDA: EdaSummary = {
  numericColumns: [
    {
      column: 'customer_tenure_months',
      min: 1,
      max: 84,
      mean: 22.4,
      median: 18.2,
      stdDev: 12.8,
      skewness: 0.61,
      q1: 9,
      q3: 31,
      outlierCount: 37,
    },
    {
      column: 'monthly_spend_usd',
      min: 15,
      max: 1240,
      mean: 218.6,
      median: 184.3,
      stdDev: 144.7,
      skewness: 1.21,
      q1: 109,
      q3: 287,
      outlierCount: 54,
    },
  ],
  categoricalColumns: [
    {
      column: 'account_tier',
      uniqueCount: 3,
      missingCount: 0,
      mode: 'pro',
      topValues: [
        { value: 'pro', count: 1170, percentage: 46.2 },
        { value: 'starter', count: 845, percentage: 33.4 },
        { value: 'enterprise', count: 515, percentage: 20.4 },
      ],
    },
    {
      column: 'region',
      uniqueCount: 5,
      missingCount: 0,
      mode: 'north_america',
      topValues: [
        { value: 'north_america', count: 905, percentage: 35.8 },
        { value: 'emea', count: 641, percentage: 25.3 },
        { value: 'apac', count: 502, percentage: 19.8 },
      ],
    },
  ],
  dataQuality: [
    {
      column: 'monthly_spend_usd',
      dataType: 'numeric',
      totalCount: 2530,
      missingCount: 12,
      missingPercentage: 0.47,
      uniqueCount: 812,
      uniquePercentage: 32.1,
    },
  ],
  histograms: [
    {
      column: 'customer_tenure_months',
      buckets: [
        { start: 0, end: 12, count: 820 },
        { start: 12, end: 24, count: 610 },
        { start: 24, end: 36, count: 455 },
        { start: 36, end: 48, count: 335 },
        { start: 48, end: 60, count: 180 },
        { start: 60, end: 72, count: 86 },
        { start: 72, end: 84, count: 44 },
      ],
    },
    {
      column: 'monthly_spend_usd',
      buckets: [
        { start: 0, end: 100, count: 430 },
        { start: 100, end: 200, count: 870 },
        { start: 200, end: 300, count: 610 },
        { start: 300, end: 400, count: 320 },
        { start: 400, end: 500, count: 160 },
        { start: 500, end: 700, count: 92 },
        { start: 700, end: 1240, count: 48 },
      ],
    },
  ],
};

const DEMO_DATA_PREVIEW: DataPreview = {
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
    {
      customer_id: 'NC-1003',
      customer_tenure_months: 17,
      monthly_spend_usd: 174,
      account_tier: 'pro',
      product_adoption_score: 0.74,
      support_tickets_90d: 1,
      is_churned: false,
    },
    {
      customer_id: 'NC-1004',
      customer_tenure_months: 41,
      monthly_spend_usd: 612,
      account_tier: 'enterprise',
      product_adoption_score: 0.93,
      support_tickets_90d: 0,
      is_churned: false,
    },
    {
      customer_id: 'NC-1005',
      customer_tenure_months: 9,
      monthly_spend_usd: 122,
      account_tier: 'starter',
      product_adoption_score: 0.39,
      support_tickets_90d: 4,
      is_churned: true,
    },
  ],
  totalRows: 2530,
  previewRows: 2530,
  eda: DEMO_EDA,
};

const DEMO_FILE: UploadedFile = {
  id: DEMO_DATA_PREVIEW.fileId,
  name: 'customers.csv',
  type: 'csv',
  size: 184_392,
  uploadedAt: new Date(NOW),
  projectId: DEMO_PROJECT_ID,
  metadata: {
    datasetId: 'landing-demo-dataset',
    tableName: 'customers',
    queryable: true,
    rowCount: DEMO_DATA_PREVIEW.totalRows,
    columnCount: DEMO_DATA_PREVIEW.headers.length,
    columns: DEMO_DATA_PREVIEW.headers,
  },
};

const DEMO_NOTEBOOK: Notebook = {
  notebookId: 'landing-standalone-notebook',
  projectId: DEMO_PROJECT_ID,
  name: 'Retention notebook',
  kind: 'standalone',
  metadata: {},
  createdAt: NOW,
  updatedAt: NOW,
};

const DEMO_TABLES: AvailableTable[] = [
  {
    datasetId: 'landing-demo-dataset',
    name: 'Customer retention',
    filename: 'customers.csv',
    sizeBytes: 184_392,
    nRows: DEMO_DATA_PREVIEW.totalRows,
    nCols: DEMO_DATA_PREVIEW.headers.length,
  },
];

const DEMO_WORKBOOKS: Record<'preprocessing' | 'feature-engineering' | 'training', WorkbookEntry[]> = {
  preprocessing: [
    { id: 'prep-workbook-1', name: 'Normalize spend', notebookId: 'prep-nb-1' },
    { id: 'prep-workbook-2', name: 'Impute support signals', notebookId: 'prep-nb-2' },
  ],
  'feature-engineering': [
    { id: 'fe-workbook-1', name: 'Retention features', notebookId: 'fe-nb-1' },
  ],
  training: [
    { id: 'train-workbook-1', name: 'Champion search', notebookId: 'train-nb-1' },
  ],
};

const DEMO_NOTEBOOK_OUTPUTS: RichOutput[] = [
  {
    type: 'table',
    content: 'Derived feature preview',
    data: {
      columns: ['feature', 'value', 'impact'],
      rows: [
        { feature: 'support_ticket_velocity', value: '1.42', impact: 'high' },
        { feature: 'expansion_ratio', value: '0.18', impact: 'medium' },
        { feature: 'tenure_bucket', value: '6-12m', impact: 'high' },
      ],
    },
  },
];

const TRAINING_METRICS: MetricSeries[] = [
  { name: 'AUC', values: [0.72, 0.79, 0.84, 0.88, 0.91], improving: true },
  { name: 'F1', values: [0.61, 0.68, 0.74, 0.79, 0.82], improving: true },
  { name: 'Log Loss', values: [0.61, 0.52, 0.44, 0.36, 0.31], improving: true },
];

const DEMO_MODEL_RECOMMENDATION = {
  id: 'novaforest-recommendation',
  template: {
    name: 'NovaForest Classifier',
    taskType: 'classification',
    library: 'sklearn',
    importPath: 'sklearn.ensemble',
    modelClass: 'RandomForestClassifier',
    parameters: [
      { key: 'n_estimators', label: 'Trees', type: 'number', default: 400 },
      { key: 'max_depth', label: 'Depth', type: 'number', default: 12 },
    ],
    metrics: ['auc', 'f1', 'precision'],
  },
  parameters: {
    n_estimators: 400,
    max_depth: 12,
    min_samples_leaf: 4,
  },
  rationale:
    'Best balance of recall and calibration on the churn label, with stable cross-validation variance and strong lift on enterprise accounts.',
};

const DEMO_MODELS: ModelRecord[] = [
  {
    modelId: 'model-novaforest',
    projectId: DEMO_PROJECT_ID,
    datasetId: 'landing-demo-dataset',
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
    featureColumns: ['customer_tenure_months', 'monthly_spend_usd', 'product_adoption_score'],
    sampleCount: 2530,
  },
  {
    modelId: 'model-xgboost',
    projectId: DEMO_PROJECT_ID,
    datasetId: 'landing-demo-dataset',
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
  {
    modelId: 'model-logreg',
    projectId: DEMO_PROJECT_ID,
    datasetId: 'landing-demo-dataset',
    name: 'Elastic Churn Baseline',
    templateId: 'logreg',
    taskType: 'classification',
    library: 'sklearn',
    algorithm: 'Logistic Regression',
    parameters: { c: 0.8, penalty: 'l2' },
    metrics: { accuracy: 0.8921, precision: 0.8294, recall: 0.7934, f1: 0.811, auc: 0.9042 },
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    trainingMs: 21_000,
    targetColumn: 'is_churned',
  },
  {
    modelId: 'model-catboost',
    projectId: DEMO_PROJECT_ID,
    datasetId: 'landing-demo-dataset',
    name: 'CatBoost Segments',
    templateId: 'catboost',
    taskType: 'classification',
    library: 'catboost',
    algorithm: 'CatBoost',
    parameters: { depth: 8, learning_rate: 0.06, iterations: 450 },
    metrics: { accuracy: 0.9019, precision: 0.8472, recall: 0.8017, f1: 0.8238, auc: 0.9196 },
    status: 'completed',
    createdAt: NOW,
    updatedAt: NOW,
    trainingMs: 64_000,
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

const FEATURE_CONTROLS: Control[] = [
  {
    key: 'window_days',
    label: 'Window',
    type: 'number',
    value: 30,
    min: 7,
    max: 180,
    step: 1,
  },
  {
    key: 'normalize',
    label: 'Normalize by account age',
    type: 'boolean',
    value: true,
  },
];

const FEATURE_SUGGESTIONS: FeatureSuggestionItem[] = [
  {
    type: 'feature_suggestion',
    id: 'feat-ticket-velocity',
    feature: {
      sourceColumn: 'support_tickets_90d',
      featureName: 'support_ticket_velocity',
      description: 'Captures how quickly support demand is accelerating before churn.',
      method: 'rolling_rate',
      params: { window_days: 30, normalize: true },
    },
    rationale: 'Ticket acceleration strongly separates churned customers in the last 90 days.',
    impact: 'high',
    controls: FEATURE_CONTROLS,
  },
  {
    type: 'feature_suggestion',
    id: 'feat-expansion-ratio',
    feature: {
      sourceColumn: 'monthly_spend_usd',
      secondaryColumn: 'customer_tenure_months',
      featureName: 'expansion_ratio',
      description: 'Measures spend growth relative to account age.',
      method: 'ratio',
      params: { numerator: 'monthly_spend_usd', denominator: 'customer_tenure_months' },
    },
    rationale: 'Separates stable enterprise expansions from short-lived starter spikes.',
    impact: 'medium',
    controls: [
      {
        key: 'clip',
        label: 'Winsorize extreme values',
        type: 'boolean',
        value: true,
      },
    ],
  },
];

type SuggestionDraft = {
  enabled: boolean;
  params: Record<string, unknown>;
};

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

export function resetLandingDemoState() {
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
    chats: {},
    isInitialized: true,
    initializedProjectId: DEMO_PROJECT_ID,
    initialize: async () => {},
    createChat: async () => {
      throw new Error('Landing demo chat creation is disabled.');
    },
    renameChat: async () => {},
    completeChat: async () => {},
    deleteChat: async () => {},
    persistChatState: async () => {},
    loadFullChat: async () => null,
    getInProgressChats: () => [],
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
    trainingRunStates: {},
    currentStage: null,
    trainingRunId: null,
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
    selectedModelId: DEMO_MODELS[0].modelId,
    comparisonModelIds: [DEMO_MODELS[0].modelId, DEMO_MODELS[1].modelId],
    experimentView: 'leaderboard',
    sortField: 'f1',
    sortDirection: 'desc',
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
    queryArtifacts: [],
    activeArtifactId: null,
    queryCounter: 0,
    hydrationError: null,
    activeFileTabId: DEMO_FILE.id,
    fileTabType: 'file',
    openFileTabs: [
      { id: DEMO_FILE.id, type: 'file' },
      { id: DEMO_NOTEBOOK.notebookId, type: 'notebook' },
    ],
    openFileTab: (id) => {
      useDataStore.setState({
        activeFileTabId: id,
        fileTabType: 'file',
      });
    },
    openNotebookTab: (notebookId) => {
      useDataStore.setState({
        activeFileTabId: notebookId,
        fileTabType: 'notebook',
      });
    },
    removeFile: (id) => {
      useDataStore.setState((state) => ({
        files: state.files.filter((file) => file.id !== id),
      }));
    },
    hydrateFromBackend: async () => {},
    markDeleted: () => {},
  });

  useNotebookStore.setState({
    currentProjectId: DEMO_PROJECT_ID,
    notebooks: [DEMO_NOTEBOOK],
    activeNotebookId: DEMO_NOTEBOOK.notebookId,
    notebook: DEMO_NOTEBOOK,
    cells: [],
    cellSummaries: [],
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
    initializeNotebook: async () => {},
    disconnect: () => {},
    loadNotebooks: async () => {},
    setActiveNotebook: async (notebookId) => {
      useNotebookStore.setState({
        activeNotebookId: notebookId,
        notebook: useNotebookStore.getState().notebooks.find((entry) => entry.notebookId === notebookId) ?? null,
      });
    },
    createNotebook: async () => DEMO_NOTEBOOK,
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
    updateNotebookMetadata: async () => DEMO_NOTEBOOK,
    loadCells: async () => {},
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

function UploadSurface() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Upload</p>
          <h2 className="mt-2 text-xl font-semibold">Ask three questions, then generate the workflow plan.</h2>
        </div>
        <QuestionCards questions={DEMO_PLAN_QUESTIONS} onSubmit={() => {}} disabled={false} />
      </div>
    </div>
  );
}

function DemoSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeProject = useProjectStore((state) =>
    state.projects.find((project) => project.id === DEMO_PROJECT_ID) ?? null,
  );
  const currentPhase = useProjectStore((state) =>
    state.projects.find((project) => project.id === DEMO_PROJECT_ID)?.currentPhase ?? DEFAULT_PHASE,
  );

  return (
    <aside className="flex h-full w-full flex-col bg-card" aria-label="Demo workspace navigation">
      <div className="border-b border-border px-4 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Active project</p>
        <p className="mt-2 text-sm font-semibold text-foreground">{activeProject?.title ?? 'NovaCraft Growth'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Frontend-only seeded demo</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-auto p-3">
        {WORKFLOW_PHASES.map((phase, index) => {
          const Icon = getLucideIcon(phaseConfig[phase].icon);
          const isActive = location.pathname.endsWith(`/${phase}`) || currentPhase === phase;
          const isCompleted = activeProject?.completedPhases.includes(phase) ?? false;

          return (
            <button
              key={phase}
              type="button"
              data-testid={`workflow-phase-button-${phase}`}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                isActive
                  ? 'border-accent-border bg-accent-bg text-accent-text'
                  : 'border-transparent text-foreground hover:bg-muted/60',
              )}
              onClick={() => navigate(`/project/${DEMO_PROJECT_ID}/${phase}`)}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
              <span className="flex-1 text-sm">{phaseConfig[phase].label}</span>
              {isCompleted ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function DataViewerSurface() {
  return (
    <div className="grid h-full gap-4 p-4 xl:grid-cols-[1.4fr_0.9fr]">
      <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-card">
        <DataTable preview={DEMO_DATA_PREVIEW} className="h-full" />
      </div>
      <div className="overflow-auto rounded-xl border border-border bg-card p-4">
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Data Viewer</p>
          <h2 className="mt-2 text-lg font-semibold">Column overview</h2>
        </div>
        <OverviewColumnCards eda={DEMO_EDA} />
      </div>
    </div>
  );
}

function PreprocessingSurface() {
  const [activeWorkbookId, setActiveWorkbookId] = useState(DEMO_WORKBOOKS.preprocessing[0].id);
  const [selectedDatasetId, setSelectedDatasetId] = useState(DEMO_TABLES[0].datasetId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between gap-3 border-b px-3">
        <PreprocessingToolbarLeft
          tabs={DEMO_WORKBOOKS.preprocessing}
          activeTabId={activeWorkbookId}
          onTabSwitch={setActiveWorkbookId}
          onNewTab={() => {}}
          onRenameTab={() => {}}
          onReplayCheck={() => {}}
          onResetTab={() => {}}
          canReplay={true}
          canDelete={false}
        />
        <PreprocessingToolbarRight
          selectedDatasetId={selectedDatasetId}
          tables={DEMO_TABLES}
          onDatasetSelect={setSelectedDatasetId}
          isLoadingTables={false}
        />
      </div>
      <div className="grid flex-1 gap-4 overflow-auto p-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Transform notebook</p>
          <pre className="mt-3 rounded-lg bg-muted/50 p-4 text-sm leading-6 text-foreground">{`df['support_ticket_velocity'] = df['support_tickets_90d'] / 90\n\ndf['spend_per_tenure_month'] = (\n    df['monthly_spend_usd'] / df['customer_tenure_months'].clip(lower=1)\n)`}</pre>
          <div className="mt-4">
            <NotebookCellOutput outputs={DEMO_NOTEBOOK_OUTPUTS} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Validation</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <dt className="text-muted-foreground">Rows preserved</dt>
              <dd className="mt-1 text-lg font-semibold">2,530 / 2,530</dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <dt className="text-muted-foreground">Null drift</dt>
              <dd className="mt-1 text-lg font-semibold">0.14%</dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <dt className="text-muted-foreground">New features</dt>
              <dd className="mt-1 text-lg font-semibold">3</dd>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
              <dt className="text-muted-foreground">Snapshot status</dt>
              <dd className="mt-1 text-lg font-semibold">Ready</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function FeatureEngineeringSurface() {
  const [drafts, setDrafts] = useState<Record<string, SuggestionDraft>>({
    [FEATURE_SUGGESTIONS[0].id]: {
      enabled: true,
      params: { window_days: 30, normalize: true },
    },
    [FEATURE_SUGGESTIONS[1].id]: {
      enabled: false,
      params: { clip: true },
    },
  });

  const activeCount = Object.values(drafts).filter((draft) => draft.enabled).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="overflow-auto p-4">
        <FeatureApprovalGate
          activeFeaturesCount={activeCount}
          implementedFeaturesCount={0}
          isGenerating={false}
          panelError={null}
          agentError={null}
          onImplement={() => {}}
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {FEATURE_SUGGESTIONS.map((item) => (
            <FeatureSuggestionCard
              key={item.id}
              item={item}
              draft={drafts[item.id]}
              datasetColumns={DEMO_DATA_PREVIEW.headers}
              onToggle={(currentItem, enabled) => {
                setDrafts((state) => ({
                  ...state,
                  [currentItem.id]: {
                    ...(state[currentItem.id] ?? { enabled, params: {} }),
                    enabled,
                  },
                }));
              }}
              onControlChange={(currentItem, key, value) => {
                setDrafts((state) => ({
                  ...state,
                  [currentItem.id]: {
                    ...(state[currentItem.id] ?? { enabled: false, params: {} }),
                    params: {
                      ...(state[currentItem.id]?.params ?? {}),
                      [key]: value,
                    },
                  },
                }));
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TrainingSurface() {
  return (
    <div className="grid h-full gap-4 p-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Training notebook</p>
        <pre className="mt-3 rounded-lg bg-muted/50 p-4 text-sm leading-6 text-foreground">{`train_df = feature_store.load('retention_features')\nchampion = automl.train(\n    target='is_churned',\n    budget='standard',\n    optimize='f1'\n)`}</pre>
        <div className="mt-4">
          <NotebookCellOutput
            outputs={[
              {
                type: 'table',
                content: 'Champion summary',
                data: {
                  columns: ['model', 'auc', 'f1', 'latency_ms'],
                  rows: [
                    { model: 'NovaForest Classifier', auc: '0.9318', f1: '0.8424', latency_ms: '41' },
                  ],
                },
              },
            ]}
          />
        </div>
      </div>
      <div className="space-y-4 overflow-auto">
        <TrainingProgressCard
          status="running"
          modelType="Random Forest"
          currentEpoch={8}
          totalEpochs={10}
          elapsedSeconds={514}
          metrics={TRAINING_METRICS}
        />
        <ModelRecommendationCard
          id={DEMO_MODEL_RECOMMENDATION.id}
          template={DEMO_MODEL_RECOMMENDATION.template}
          parameters={DEMO_MODEL_RECOMMENDATION.parameters}
          rationale={DEMO_MODEL_RECOMMENDATION.rationale}
        />
      </div>
    </div>
  );
}

function ExperimentsSurface() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Experiments</p>
        <h2 className="mt-2 text-lg font-semibold">Champion leaderboard</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Leaderboard />
      </div>
    </div>
  );
}

function DeploymentSurface() {
  const [activeTab, setActiveTab] = useState<'overview'>('overview');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 items-center justify-between gap-3 border-b px-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Deployment</p>
          <h2 className="text-sm font-semibold text-foreground">Production overview</h2>
        </div>
        <IconModeToggle
          value={activeTab}
          onValueChange={() => setActiveTab('overview')}
          options={[
            {
              value: 'overview',
              ariaLabel: 'Overview',
              icon: LayoutDashboard,
              tooltip: 'Overview',
            },
          ]}
        />
      </div>
      <DeploymentDetail deployment={DEMO_DEPLOYMENT} activeTab={activeTab} />
    </div>
  );
}

function DemoPhaseSurface() {
  const { phase } = useParams<{ phase: string }>();
  const currentPhase = (phase as Phase | undefined) ?? DEFAULT_PHASE;

  useEffect(() => {
    useProjectStore.getState().setCurrentPhase(DEMO_PROJECT_ID, currentPhase);
  }, [currentPhase]);

  switch (currentPhase) {
    case 'upload':
      return <UploadSurface />;
    case 'data-viewer':
      return <DataViewerSurface />;
    case 'preprocessing':
      return <PreprocessingSurface />;
    case 'feature-engineering':
      return <FeatureEngineeringSurface />;
    case 'training':
      return <TrainingSurface />;
    case 'experiments':
      return <ExperimentsSurface />;
    case 'deployment':
      return <DeploymentSurface />;
    default:
      return <Navigate to={`/project/${DEMO_PROJECT_ID}/${DEFAULT_PHASE}`} replace />;
  }
}

export interface DemoWorkspaceProps {
  initialPhase?: Phase;
}

export function DemoWorkspace({ initialPhase = DEFAULT_PHASE }: DemoWorkspaceProps) {
  const initialEntries = useMemo(
    () => [`/project/${DEMO_PROJECT_ID}/${initialPhase}`],
    [initialPhase],
  );

  return (
    <ThemeProvider defaultTheme="light" storageKey="landing-demo-theme">
      <TooltipProvider delayDuration={200}>
        <MemoryRouter initialEntries={initialEntries}>
          <div className="h-full bg-background text-foreground" data-testid="landing-demo-workspace">
            <AppShell viewportMode="container" sidebar={<DemoSidebar />}>
              <Routes>
                <Route path="/project/:projectId/:phase" element={<DemoPhaseSurface />} />
                <Route path="*" element={<Navigate to={`/project/${DEMO_PROJECT_ID}/${initialPhase}`} replace />} />
              </Routes>
            </AppShell>
          </div>
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}

resetLandingDemoState();

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
import type { Notebook } from '@/types/notebook';
import type { WorkbookEntry } from '@/types/workbook';
import type { AvailableTable } from '@/types/preprocessing';
import type { ModelRecord } from '@/types/model';
import type { DeploymentRecord } from '@/types/deployment';

export const DEMO_PROJECT_ID = 'landing-demo-project';
const DEMO_DATASET_ID = 'landing-demo-dataset';
export const DEFAULT_PHASE: Phase = 'upload';
const NOW = '2026-04-13T15:30:00.000Z';
const DATA_VIEWER_TABS_STORAGE_KEY = 'automl-data-viewer-tabs-v1';
const TRAINING_WORKBOOKS_STORAGE_KEY = `training-workbooks-v1-${DEMO_PROJECT_ID}`;

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
  messages: [],
  answerHistory: [],
  currentRound: 2,
  createdAt: new Date(NOW).getTime(),
  updatedAt: new Date(NOW).getTime(),
};

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

const DEMO_NOTEBOOK: Notebook = {
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
    runId: null,
    nextRunCellMode: 'continue',
    latestCheckpointId: null,
    assistantMessages: [],
    timeline: [],
    stepBindings: {},
    replayReport: null,
    controllerSummary: null,
    isLoadingTables: false,
    error: null,
    loadTables: async () => {},
    hydrateRunById: async () => {},
    evaluateReplayCompatibility: async () => {},
  });

  useFeatureStore.setState({
    features: [],
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
    featureSteps: {},
    currentStage: null,
    featureRunId: null,
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

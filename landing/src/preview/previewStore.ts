import { create } from 'zustand';
import type {
  WorkflowPhase,
  FakeUser,
  FakeProject,
  DeploymentSubTab,
  QueryMode,
  QueryResultFixture,
} from './types';
import { mockUser, mockProject } from './fixtures/project';

interface DataViewerState {
  activeFileTabId: string;
  queryMode: QueryMode;
  queryResult: QueryResultFixture;
}

interface PreprocessingState { activeCellId: string | null }
interface FeatureEngineeringState { activeCellId: string | null }
interface TrainingState {
  activeCellId: string | null;
  selectedModelId: string | null;
}
interface ExperimentsState {
  selectedModelId: string | null;
  sortBy: string;
  filters: Record<string, unknown>;
}
interface DeploymentState {
  activeSubTab: DeploymentSubTab;
  playgroundInput: string;
  playgroundOutput: string;
}

interface PreviewStore {
  // Identity (read-only in practice)
  fakeUser: FakeUser;
  fakeProject: FakeProject;

  // Tab navigation
  activeTab: WorkflowPhase;
  setActiveTab: (tab: WorkflowPhase) => void;

  // Per-tab interaction state
  dataViewer: DataViewerState;
  setDataViewerFileTab: (id: string) => void;
  setDataViewerQueryMode: (mode: QueryMode) => void;

  preprocessing: PreprocessingState;
  setPreprocessingActiveCell: (id: string | null) => void;

  featureEngineering: FeatureEngineeringState;
  setFeatureEngineeringActiveCell: (id: string | null) => void;

  training: TrainingState;
  setTrainingActiveCell: (id: string | null) => void;
  setTrainingSelectedModel: (id: string | null) => void;

  experiments: ExperimentsState;
  selectExperimentModel: (id: string | null) => void;
  setExperimentsSortBy: (sortBy: string) => void;

  deployment: DeploymentState;
  setDeploymentSubTab: (tab: DeploymentSubTab) => void;
  setDeploymentPlaygroundInput: (v: string) => void;
}

const initialQueryResult: QueryResultFixture = {
  english: 'which customers churned in Q2?',
  sql: `SELECT c.customer_id, c.company_name, c.plan_tier
FROM customers c
LEFT JOIN subscriptions s ON s.customer_id = c.customer_id
WHERE c.is_active = false
  AND s.end_date BETWEEN '2026-04-01' AND '2026-06-30'
ORDER BY c.annual_revenue_usd DESC;`,
  rowCount: 1249,
  durationMs: 420,
};

export const usePreviewStore = create<PreviewStore>((set) => ({
  fakeUser: mockUser,
  fakeProject: mockProject,

  activeTab: 'data-viewer',
  setActiveTab: (tab) => set({ activeTab: tab }),

  dataViewer: {
    activeFileTabId: 'customers_csv',
    queryMode: 'english',
    queryResult: initialQueryResult,
  },
  setDataViewerFileTab: (id) =>
    set((s) => ({ dataViewer: { ...s.dataViewer, activeFileTabId: id } })),
  setDataViewerQueryMode: (mode) =>
    set((s) => ({ dataViewer: { ...s.dataViewer, queryMode: mode } })),

  preprocessing: { activeCellId: null },
  setPreprocessingActiveCell: (id) =>
    set((s) => ({ preprocessing: { ...s.preprocessing, activeCellId: id } })),

  featureEngineering: { activeCellId: null },
  setFeatureEngineeringActiveCell: (id) =>
    set((s) => ({ featureEngineering: { ...s.featureEngineering, activeCellId: id } })),

  training: { activeCellId: null, selectedModelId: null },
  setTrainingActiveCell: (id) =>
    set((s) => ({ training: { ...s.training, activeCellId: id } })),
  setTrainingSelectedModel: (id) =>
    set((s) => ({ training: { ...s.training, selectedModelId: id } })),

  experiments: { selectedModelId: null, sortBy: 'rank', filters: {} },
  selectExperimentModel: (id) =>
    set((s) => ({ experiments: { ...s.experiments, selectedModelId: id } })),
  setExperimentsSortBy: (sortBy) =>
    set((s) => ({ experiments: { ...s.experiments, sortBy } })),

  deployment: {
    activeSubTab: 'overview',
    playgroundInput: '',
    playgroundOutput: '',
  },
  setDeploymentSubTab: (tab) =>
    set((s) => ({ deployment: { ...s.deployment, activeSubTab: tab } })),
  setDeploymentPlaygroundInput: (v) =>
    set((s) => ({ deployment: { ...s.deployment, playgroundInput: v } })),
}));

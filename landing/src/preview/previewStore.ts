import { create } from 'zustand';
import type {
  WorkflowPhase,
  FakeUser,
  FakeProject,
  DeploymentSubTab,
  QueryResultFixture,
} from './types';
import { mockUser, mockProject } from './fixtures/project';

interface DataViewerState {
  activeFileTabId: string;
  queryResult: QueryResultFixture;
}

interface ExperimentsState {
  selectedModelId: string | null;
}

interface DeploymentState {
  activeSubTab: DeploymentSubTab;
}

interface PreviewStore {
  fakeUser: FakeUser;
  fakeProject: FakeProject;

  activeTab: WorkflowPhase;
  setActiveTab: (tab: WorkflowPhase) => void;

  dataViewer: DataViewerState;
  setDataViewerFileTab: (id: string) => void;

  experiments: ExperimentsState;
  selectExperimentModel: (id: string | null) => void;

  deployment: DeploymentState;
  setDeploymentSubTab: (tab: DeploymentSubTab) => void;
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
    queryResult: initialQueryResult,
  },
  setDataViewerFileTab: (id) =>
    set((s) => ({ dataViewer: { ...s.dataViewer, activeFileTabId: id } })),

  experiments: { selectedModelId: null },
  selectExperimentModel: (id) =>
    set((s) => ({ experiments: { ...s.experiments, selectedModelId: id } })),

  deployment: {
    activeSubTab: 'overview',
  },
  setDeploymentSubTab: (tab) =>
    set((s) => ({ deployment: { ...s.deployment, activeSubTab: tab } })),
}));

// Types shared by the preview store, context provider, and fixtures.

export type WorkflowPhase =
  | 'upload'
  | 'data-viewer'
  | 'preprocessing'
  | 'feature-engineering'
  | 'training'
  | 'experiments'
  | 'deployment';

export interface FakeUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface FakeProject {
  id: string;
  name: string;
  color: 'violet' | 'blue' | 'emerald' | 'amber' | 'rose';
  icon: string;
  createdAt: string;
  phases: Record<WorkflowPhase, 'locked' | 'in-progress' | 'completed'>;
}

export type DeploymentSubTab =
  | 'overview'
  | 'playground'
  | 'api'
  | 'logs'
  | 'monitoring';

export type QueryMode = 'english' | 'sql';

export interface QueryResultFixture {
  english: string;
  sql: string;
  rowCount: number;
  durationMs: number;
}

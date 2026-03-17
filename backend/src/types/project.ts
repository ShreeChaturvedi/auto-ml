export type PhaseValue =
  | 'upload'
  | 'data-viewer'
  | 'preprocessing'
  | 'feature-engineering'
  | 'training'
  | 'experiments'
  | 'deployment'
  | 'notebook';

export interface ProjectMetadata {
  unlockedPhases?: PhaseValue[];
  completedPhases?: PhaseValue[];
  currentPhase?: PhaseValue;
  customInstructions?: string;
  [key: string]: unknown;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: ProjectMetadata;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  metadata?: ProjectMetadata;
}

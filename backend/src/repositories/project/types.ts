import { z } from 'zod';

import type { CreateProjectInput, Project, ProjectMetadata, PhaseValue } from '../../types/project.js';

export interface ProjectRepository {
  list(): Promise<Project[]>;
  listByUser(userId: string): Promise<Project[]>;
  getById(id: string): Promise<Project | undefined>;
  getByIdAndUser(id: string, userId: string): Promise<Project | undefined>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: string, input: Partial<CreateProjectInput>): Promise<Project | undefined>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export const PHASE_VALUES = [
  'upload',
  'data-viewer',
  'preprocessing',
  'feature-engineering',
  'training',
  'experiments',
  'deployment',
  'notebook'
] as const satisfies readonly PhaseValue[];

const phaseSchema = z.enum(PHASE_VALUES);

export const metadataSchema = z
  .object({
    unlockedPhases: z.array(phaseSchema).optional(),
    completedPhases: z.array(phaseSchema).optional(),
    currentPhase: phaseSchema.optional(),
    customInstructions: z.string().max(5000).optional()
  })
  .catchall(z.unknown())
  .optional();

export const storedProjectSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: metadataSchema
});

export const storedProjectsSchema = z.array(storedProjectSchema);

export const DEFAULT_METADATA: Required<ProjectMetadata> = {
  unlockedPhases: ['upload'],
  completedPhases: [],
  currentPhase: 'upload',
  customInstructions: ''
};

export function sanitizeMetadata(metadata?: ProjectMetadata): ProjectMetadata {
  const unlocked = Array.isArray(metadata?.unlockedPhases)
    ? metadata?.unlockedPhases.filter(isValidPhase)
    : DEFAULT_METADATA.unlockedPhases;

  const completed = Array.isArray(metadata?.completedPhases)
    ? metadata?.completedPhases.filter((phase) => isValidPhase(phase) && unlocked.includes(phase))
    : DEFAULT_METADATA.completedPhases;

  const current = isValidPhase(metadata?.currentPhase)
    ? metadata?.currentPhase
    : DEFAULT_METADATA.currentPhase;

  const customInstructions = typeof metadata?.customInstructions === 'string'
    ? metadata?.customInstructions
    : DEFAULT_METADATA.customInstructions;

  return {
    ...metadata,
    unlockedPhases: Array.from(new Set([...unlocked, current, DEFAULT_METADATA.currentPhase])),
    completedPhases: completed,
    currentPhase: current,
    customInstructions
  };
}

export function isValidPhase(value: unknown): value is PhaseValue {
  return typeof value === 'string' && PHASE_VALUES.includes(value as PhaseValue);
}

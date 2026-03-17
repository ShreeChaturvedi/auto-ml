import { getAllPhasesSorted, getNextPhase } from '@/types/phase';
import type { Phase } from '@/types/phase';
import type { ApiProjectMetadata } from '@/lib/api/projects';
import type { Project, ProjectColor } from '@/types/project';
import { projectColorClasses } from '@/types/project';

export const DEFAULT_PHASE_STATE = {
  unlockedPhases: ['upload'] as Phase[],
  currentPhase: 'upload' as Phase,
  completedPhases: [] as Phase[]
};

const ALL_PHASES = getAllPhasesSorted();

function isValidPhase(value: unknown): value is Phase {
  return typeof value === 'string' && (ALL_PHASES as readonly string[]).includes(value as string);
}

function normalizePhaseList(list?: Phase[]): Phase[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<Phase>();
  list.forEach((value) => {
    if (isValidPhase(value)) {
      seen.add(value);
    }
  });
  return ALL_PHASES.filter((phase) => seen.has(phase));
}

export function buildPhaseState(metadata?: ApiProjectMetadata) {
  const unlocked = normalizePhaseList(metadata?.unlockedPhases);
  const completed = normalizePhaseList(metadata?.completedPhases).filter((phase) => unlocked.includes(phase));
  const current = isValidPhase(metadata?.currentPhase)
    ? (metadata?.currentPhase as Phase)
    : DEFAULT_PHASE_STATE.currentPhase;

  if (!unlocked.includes(DEFAULT_PHASE_STATE.currentPhase)) {
    unlocked.push(DEFAULT_PHASE_STATE.currentPhase);
  }
  if (!unlocked.includes(current)) {
    unlocked.push(current);
  }

  return {
    unlockedPhases: unlocked.length > 0 ? unlocked : [...DEFAULT_PHASE_STATE.unlockedPhases],
    completedPhases: completed,
    currentPhase: current
  };
}

export function isProjectColor(value: unknown): value is ProjectColor {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(projectColorClasses, value)
  );
}

export function completePhaseForProject(project: Project, phase: Phase): {
  completedPhases: Phase[];
  unlockedPhases: Phase[];
} {
  const completedPhases = project.completedPhases.includes(phase)
    ? project.completedPhases
    : [...project.completedPhases, phase];

  const nextPhase = getNextPhase(phase);
  const unlockedPhases = nextPhase && !project.unlockedPhases.includes(nextPhase)
    ? [...project.unlockedPhases, nextPhase]
    : project.unlockedPhases;

  return { completedPhases, unlockedPhases };
}

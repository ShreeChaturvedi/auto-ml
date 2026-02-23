/**
 * Phase type definitions for workflow progression
 *
 * Phases represent stages in the ML workflow that unlock sequentially.
 * Unlike the old tab system, phases are workflow stages that must be completed in order.
 */

export type Phase =
  | 'upload'
  | 'data-viewer'
  | 'preprocessing'
  | 'feature-engineering'
  | 'training'
  | 'experiments'
  | 'deployment';

/**
 * Phase configuration for each workflow stage
 * Defines the icon, label, description, and order
 * 
 * Note: The "chat" phase was removed. AI assistance is now embedded:
 * - Preprocessing: Control panel UI with AI suggestions
 * - Feature Engineering: Control panel with AI suggestions
 * - Training: Jupyter-style interface with chat + code cells
 */
export interface PhaseConfig {
  icon: string; // lucide-react icon name
  label: string;
  description: string;
  order: number; // Workflow order (0-indexed)
}

/**
 * Configuration for all phases
 */
export const phaseConfig: Record<Phase, PhaseConfig> = {
  'upload': {
    icon: 'Upload',
    label: 'Data Upload',
    description: 'Upload datasets and business context',
    order: 0
  },
  'data-viewer': {
    icon: 'Table',
    label: 'Explorer',
    description: 'Explore, query, and analyze your data',
    order: 1
  },
  'preprocessing': {
    icon: 'Workflow',
    label: 'Processing',
    description: 'AI-powered data cleaning and transformation',
    order: 2
  },
  'feature-engineering': {
    icon: 'Wrench',
    label: 'Feature Engineering',
    description: 'Create and select predictive features',
    order: 3
  },
  'training': {
    icon: 'Play',
    label: 'Training',
    description: 'Train models with AI assistance',
    order: 4
  },
  'experiments': {
    icon: 'FlaskConical',
    label: 'Experiments',
    description: 'Track and compare experiments',
    order: 5
  },
  'deployment': {
    icon: 'Rocket',
    label: 'Deployment',
    description: 'Deploy models to production',
    order: 6
  }
};

/**
 * Get all phases sorted by workflow order
 */
export function getAllPhasesSorted(): Phase[] {
  return (Object.keys(phaseConfig) as Phase[]).sort(
    (a, b) => phaseConfig[a].order - phaseConfig[b].order
  );
}

/**
 * Get the next phase in the workflow
 * Returns undefined if current phase is the last one
 */
export function getNextPhase(currentPhase: Phase): Phase | undefined {
  const allPhases = getAllPhasesSorted();
  const currentIndex = allPhases.indexOf(currentPhase);

  if (currentIndex === -1 || currentIndex === allPhases.length - 1) {
    return undefined;
  }

  return allPhases[currentIndex + 1];
}

/**
 * Get the previous phase in the workflow
 * Returns undefined if current phase is the first one
 */
export function getPreviousPhase(currentPhase: Phase): Phase | undefined {
  const allPhases = getAllPhasesSorted();
  const currentIndex = allPhases.indexOf(currentPhase);

  if (currentIndex <= 0) {
    return undefined;
  }

  return allPhases[currentIndex - 1];
}

/**
 * Check if a phase comes after another phase in the workflow
 */
export function isPhaseAfter(phase: Phase, targetPhase: Phase): boolean {
  return phaseConfig[phase].order > phaseConfig[targetPhase].order;
}

/**
 * Get all phases up to and including the target phase
 */
export function getPhasesUpTo(targetPhase: Phase): Phase[] {
  const allPhases = getAllPhasesSorted();
  const targetOrder = phaseConfig[targetPhase].order;

  return allPhases.filter((phase) => phaseConfig[phase].order <= targetOrder);
}

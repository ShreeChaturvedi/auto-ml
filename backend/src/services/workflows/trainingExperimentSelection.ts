import { asRecord, asString } from '../../utils/typeCoercion.js';

import type { WorkflowGraphState } from './graphState.js';
import type { WorkflowRunState } from './types.js';

type ExperimentRecord = Record<string, unknown>;

function listExperiments(run: WorkflowRunState): ExperimentRecord[] {
  const experiments = asRecord(run.metadata?.experiments);
  if (!experiments) {
    return [];
  }
  return Object.values(experiments)
    .map((value) => asRecord(value))
    .filter((value): value is ExperimentRecord => Boolean(value));
}

export function parseApprovedTrainingExperimentNames(prompt: string | undefined): string[] {
  if (!prompt?.trim()) {
    return [];
  }

  const match = prompt.match(/approved\.\s*proceed with training the selected models:\s*(.+?)(?:\.\s*$|$)/i);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(/\s*,\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getApprovedTrainingExperiments(
  run: WorkflowRunState,
  prompt: string | undefined
): ExperimentRecord[] {
  const experiments = listExperiments(run);
  const approvedNames = parseApprovedTrainingExperimentNames(prompt);
  if (approvedNames.length === 0) {
    return experiments;
  }

  const byName = new Map(
    experiments
      .map((experiment) => [asString(experiment.experimentName), experiment] as const)
      .filter((entry): entry is [string, ExperimentRecord] => Boolean(entry[0]))
  );

  return approvedNames
    .map((name) => byName.get(name))
    .filter((experiment): experiment is ExperimentRecord => Boolean(experiment));
}

export function hasPendingApprovedTrainingExperiments(
  run: WorkflowRunState,
  prompt: string | undefined
): boolean {
  return getApprovedTrainingExperiments(run, prompt).some((experiment) => {
    const status = asString(experiment.status);
    return status !== 'registered';
  });
}

export function selectTrainingExecutionExperiment(
  run: WorkflowRunState,
  state: Pick<WorkflowGraphState, 'toolResultHistory' | 'turn'>,
  preferredExperimentId?: string | null
): ExperimentRecord | null {
  const experiments = listExperiments(run);
  if (experiments.length === 0) {
    return null;
  }

  const approved = getApprovedTrainingExperiments(run, state.turn.prompt);
  const approvedIds = new Set(
    approved
      .map((experiment) => asString(experiment.experimentId))
      .filter((value): value is string => Boolean(value))
  );
  const pool = approved.length > 0 ? approved : experiments;

  if (preferredExperimentId) {
    const preferred = pool.find((experiment) => asString(experiment.experimentId) === preferredExperimentId);
    if (preferred && asString(preferred.status) !== 'registered') {
      return preferred;
    }
  }

  const pending = pool.find((experiment) => asString(experiment.status) !== 'registered');
  if (pending) {
    return pending;
  }

  const latestFromHistory = [...state.toolResultHistory].reverse().find((result) => {
    if (result.error || !result.output || typeof result.output !== 'object' || Array.isArray(result.output)) {
      return false;
    }
    const experimentId = asString((result.output as Record<string, unknown>).experimentId);
    if (!experimentId) {
      return false;
    }
    return approvedIds.size === 0 || approvedIds.has(experimentId);
  });
  if (latestFromHistory?.output && typeof latestFromHistory.output === 'object' && !Array.isArray(latestFromHistory.output)) {
    const latestId = asString((latestFromHistory.output as Record<string, unknown>).experimentId);
    const latest = pool.find((experiment) => asString(experiment.experimentId) === latestId);
    if (latest) {
      return latest;
    }
  }

  return pool[0] ?? null;
}

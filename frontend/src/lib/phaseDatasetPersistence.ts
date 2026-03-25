import { useProjectStore } from '@/stores/projectStore';

/**
 * Persist the selected dataset ID for a given phase so downstream phases
 * can auto-select the same dataset.
 */
export function persistPhaseDataset(projectId: string, phase: string, datasetId: string) {
  const store = useProjectStore.getState();
  const project = store.getProjectById(projectId);
  if (!project) return;
  const phaseDatasets = (project.metadata?.phaseDatasets as Record<string, string>) ?? {};
  if (phaseDatasets[phase] === datasetId) return;
  void store.updateProject(projectId, {
    metadata: { ...project.metadata, phaseDatasets: { ...phaseDatasets, [phase]: datasetId } }
  });
}

/**
 * Look up the dataset ID persisted by a previous phase. Checks phases in
 * the order given and returns the first match, or undefined if none found.
 */
export function getPreviousPhaseDataset(projectId: string, ...phases: string[]): string | undefined {
  const project = useProjectStore.getState().getProjectById(projectId);
  const phaseDatasets = (project?.metadata?.phaseDatasets as Record<string, string>) ?? {};
  for (const phase of phases) {
    if (phaseDatasets[phase]) return phaseDatasets[phase];
  }
  return undefined;
}

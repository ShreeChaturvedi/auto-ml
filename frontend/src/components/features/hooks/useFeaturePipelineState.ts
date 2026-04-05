import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { fetchFeatureRun, fetchFeatureRuns } from '@/lib/api/featureEngineering';
import { getPreviousPhaseDataset, persistPhaseDataset } from '@/lib/phaseDatasetPersistence';
import type { FeatureSpec, PipelineVersion, ReadinessReport } from '@/types/feature';
import type { FeatureLifecycleStep } from '@/stores/featureStore';
import { useFeatureReadiness } from './useFeatureReadiness';
import { useFeatureVersioning } from './useFeatureVersioning';
import { useFeatureApply } from './useFeatureApply';
import { useSuggestionDrafts } from './useSuggestionDrafts';
import type { FeatureSuggestionItem } from '../featureEngineeringUtils';

export type { SuggestionDraft } from './useSuggestionDrafts';

const EMPTY_PIPELINE_VERSIONS: PipelineVersion[] = [];

function isFeaturePipelineRunId(runId: string): boolean {
  return runId.startsWith('feat-') || runId.startsWith('feature-run-');
}

interface UseFeaturePipelineStateReturn {
  // Dataset state
  selectedDataset: string | null;
  setSelectedDataset: (id: string | null) => void;
  targetColumn: string | undefined;
  setTargetColumn: (column: string | undefined) => void;
  datasetFiles: ReturnType<typeof useDataStore.getState>['files'];
  documentFiles: ReturnType<typeof useDataStore.getState>['files'];
  selectedDatasetFile: ReturnType<typeof useDataStore.getState>['files'][number] | undefined;
  datasetColumns: string[];

  // Version state
  versions: PipelineVersion[];
  currentVersionId: string | undefined;
  currentVersion: PipelineVersion | undefined;
  chatSessionVersion: number;
  isApproved: boolean;
  isCurrentVersionDraft: boolean;

  // Feature state
  projectFeatures: FeatureSpec[];
  activeFeatures: FeatureSpec[];
  featureById: Map<string, FeatureSpec>;
  featureSteps: Record<string, FeatureLifecycleStep>;
  currentStage: string | null;

  // Readiness
  readinessReport: ReadinessReport;
  isReadyForApproval: boolean;
  readinessReportUnlocked: boolean;
  isReadinessExpanded: boolean;
  setIsReadinessExpanded: (expanded: boolean) => void;

  // Apply state
  outputName: string;
  setOutputName: (name: string) => void;
  outputFormat: 'csv' | 'json' | 'xlsx';
  setOutputFormat: (format: 'csv' | 'json' | 'xlsx') => void;
  applyStatus: 'idle' | 'loading' | 'success' | 'error';
  applyMessage: string | null;

  // Errors
  panelError: string | null;
  setPanelError: (error: string | null) => void;

  // Suggestion drafts
  suggestionDrafts: Record<string, { enabled: boolean; params: Record<string, unknown> }>;
  toggleSuggestion: (item: FeatureSuggestionItem, enabled: boolean) => void;
  updateSuggestionControl: (item: FeatureSuggestionItem, key: string, value: unknown) => void;

  // Actions
  handleApplyFeatures: () => Promise<void>;
  handleVersionSwitch: (value: string) => void;
  handleNewDraft: () => void;
  handleDeleteDraft: () => void;
  handleRenameDraft: () => void;
  handleReplay: () => void;
  handleReset: () => void;

  // Dialog state
  renameDialogOpen: boolean;
  setRenameDialogOpen: (open: boolean) => void;
  renameDialogValue: string;
  setRenameDialogValue: (value: string) => void;
  handleRenameConfirm: () => void;
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  handleDeleteConfirm: () => void;

  // Store actions (passed through for toolbar/approval gate)
  approveVersion: (projectId: string, versionId: string) => void;
}

/** Pick the best dataset for feature engineering: prefer derived datasets, then most recent. */
function pickBestDataset(datasets: ReturnType<typeof useDataStore.getState>['files']): typeof datasets[number] {
  const sorted = [...datasets].sort((a, b) => {
    const aDerived = a.metadata?.derivedFrom ? 1 : 0;
    const bDerived = b.metadata?.derivedFrom ? 1 : 0;
    if (aDerived !== bDerived) return bDerived - aDerived;
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
  });
  return sorted[0];
}

export function useFeaturePipelineState(projectId: string): UseFeaturePipelineStateReturn {
  // --- Data store ---
  const allFiles = useDataStore((state) => state.files);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

  // --- Feature store selectors ---
  const features = useFeatureStore((state) => state.features);
  const versionEntries = useFeatureStore((state) => state.versions[projectId] ?? EMPTY_PIPELINE_VERSIONS);
  const selectedVersionId = useFeatureStore((state) => state.currentVersionId[projectId]);
  const hydrateFeatures = useFeatureStore((state) => state.hydrateFromProject);
  const featureSteps = useFeatureStore((state) => state.featureSteps);
  const currentStage = useFeatureStore((state) => state.currentStage);

  // --- Local state ---
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string | undefined>();
  const [panelError, setPanelError] = useState<string | null>(null);

  // --- Refs ---
  const hydratedProjectRef = useRef<string | null>(null);

  // --- Hydration effect ---
  useEffect(() => {
    if (hydratedProjectRef.current === projectId) return;
    hydratedProjectRef.current = projectId;
    let cancelled = false;

    const hydrateRunIntoStore = (run: { runId: string; features?: Record<string, import('@/lib/api/featureEngineering').FeatureStepRecord> }) => {
      const featureStore = useFeatureStore.getState();
      featureStore.setFeatureRunId(run.runId);
      for (const [featureId, step] of Object.entries(run.features ?? {})) {
        featureStore.setFeatureStep(featureId, {
          stepId: step.featureId,
          name: step.name,
          method: step.method,
          status: step.status,
          code: step.code,
          metrics: step.validation as Record<string, unknown> | undefined
        });

        // Back-fill LLM-authored code into the existing FeatureSpec for
        // registered features. Without this, features loaded from the
        // backend run state (e.g., after a page reload) wouldn't have
        // their `code` field populated — and the apply pipeline would
        // fall back to the method-based codegen template, producing
        // wrong data for complex features like groupby shares.
        if (step.status === 'registered' && step.code) {
          const existing = featureStore.features.find((f) => f.id === featureId);
          if (existing && existing.code !== step.code) {
            featureStore.upsertFeature({ ...existing, code: step.code });
          }
        }
      }
    };

    void (async () => {
      try {
        await hydrateFromBackend(projectId);
        if (cancelled) {
          return;
        }

        const hydrationError = useDataStore.getState().hydrationError;
        if (hydrationError) {
          setPanelError(hydrationError);
          return;
        }

        hydrateFeatures(projectId, { force: true });

        // Hydrate feature lifecycle state from backend runs endpoint
        const store = useFeatureStore.getState();

        // Skip if store already has lifecycle state from this session
        if (store.featureRunId && Object.keys(store.featureSteps).length > 0) {
          return;
        }

        // Resolve the feature pipeline run ID.  Prefer the store value (set by
        // tool results during this session).  Fall back to the latest run for
        // the project so we never accidentally use the workflow session runId
        // (which comes from a different data store and causes 404s).
        let featureRunId: string | undefined = store.featureRunId ?? undefined;
        let runData: import('@/lib/api/featureEngineering').FeaturePipelineRunState | undefined;

        if (featureRunId && !isFeaturePipelineRunId(featureRunId)) {
          useFeatureStore.getState().setFeatureRunId(null);
          featureRunId = undefined;
        }

        if (featureRunId) {
          try {
            const { run } = await fetchFeatureRun(featureRunId);
            if (cancelled) return;
            runData = run;
          } catch {
            // Stale or conflated ID — clear it and fall through to project-level lookup
            useFeatureStore.getState().setFeatureRunId(null);
            featureRunId = undefined;
          }
        }

        if (!featureRunId) {
          const { runs } = await fetchFeatureRuns(projectId, 1);
          if (cancelled) return;
          runData = runs[0];
        }

        if (runData) {
          hydrateRunIntoStore(runData);

          // Derive currentStage from the last step's status
          const steps = Object.values(runData.features ?? {});
          if (steps.length > 0) {
            const lastStep = steps[steps.length - 1];
            const derivedStage =
              lastStep.status === 'awaiting_approval' ? 'validate_feature'
                : lastStep.status === 'completed' || lastStep.status === 'registered' ? 'register_feature'
                  : lastStep.status === 'executing' ? 'execute_feature'
                    : lastStep.status === 'rejected' ? 'propose_feature'
                      : null;
            if (derivedStage) {
              useFeatureStore.getState().setCurrentStage(derivedStage);
            }
          }
        }

        setPanelError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPanelError(
          error instanceof Error ? error.message : 'Failed to hydrate feature engineering state.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateFeatures, hydrateFromBackend, projectId, setPanelError]);

  // --- Derived file data ---
  const files = useMemo(
    () => allFiles.filter((file) => file.projectId === projectId),
    [allFiles, projectId]
  );

  const datasetFiles = useMemo(
    () => files.filter((file) => ['csv', 'json', 'excel'].includes(file.type)),
    [files]
  );

  const documentFiles = useMemo(
    () => files.filter((file) => Boolean(file.metadata?.documentId)),
    [files]
  );

  const selectedDatasetFile = useMemo(
    () => datasetFiles.find((file) => file.id === selectedDataset),
    [datasetFiles, selectedDataset]
  );

  const datasetColumns = useMemo(
    () => selectedDatasetFile?.metadata?.columns ?? [],
    [selectedDatasetFile]
  );

  // --- Derived feature data ---
  const projectFeatures = useMemo(
    () => features.filter((feature) => feature.projectId === projectId),
    [features, projectId]
  );

  const activeFeatures = useMemo(
    () => projectFeatures.filter((feature) => feature.enabled),
    [projectFeatures]
  );

  const featureById = useMemo(
    () => new Map(projectFeatures.map((feature) => [feature.id, feature])),
    [projectFeatures]
  );

  const currentVersionNotebookId = useMemo(() => {
    const fallbackVersion = versionEntries[0];
    const resolvedVersion = selectedVersionId
      ? versionEntries.find((version) => version.id === selectedVersionId) ?? fallbackVersion
      : fallbackVersion;
    return resolvedVersion?.notebookId;
  }, [selectedVersionId, versionEntries]);

  // --- Suggestion drafts (extracted hook) ---
  const {
    suggestionDrafts,
    toggleSuggestion,
    updateSuggestionControl,
  } = useSuggestionDrafts({
    projectId,
    featureById,
    setPanelError,
  });

  // --- Apply (extracted hook) ---
  const {
    outputName,
    setOutputName,
    outputFormat,
    setOutputFormat,
    applyStatus,
    setApplyStatus,
    applyMessage,
    setApplyMessage,
    handleApplyFeatures,
  } = useFeatureApply({
    projectId,
    notebookId: currentVersionNotebookId,
    projectFeatures,
    selectedDatasetFile,
    setSelectedDataset,
  });

  // --- Versioning (extracted hook) ---
  const {
    versions,
    currentVersionId,
    currentVersion,
    chatSessionVersion,
    isApproved,
    isCurrentVersionDraft,
    approveVersion,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft,
    handleRenameDraft,
    handleReplay,
    handleReset,
    renameDialogOpen,
    setRenameDialogOpen,
    renameDialogValue,
    setRenameDialogValue,
    handleRenameConfirm,
    deleteDialogOpen,
    setDeleteDialogOpen,
    handleDeleteConfirm,
  } = useFeatureVersioning({
    projectId,
    setPanelError,
    setApplyStatus,
    setApplyMessage,
  });

  // --- Readiness (extracted hook) ---
  const {
    readinessReport,
    isReadyForApproval,
    readinessReportUnlocked,
    isReadinessExpanded,
    setIsReadinessExpanded
  } = useFeatureReadiness(projectId, activeFeatures, datasetColumns, currentVersion);

  // --- Default dataset selection effect ---
  // Precedence order when the local state is empty (fresh mount, tab switch,
  // page reload):
  //   1. This phase's own persisted dataset (so user selections survive
  //      remounts and tab switches within the FE phase).
  //   2. The previous phase's dataset (cross-phase continuity from
  //      preprocessing → FE).
  //   3. pickBestDataset fallback (heuristic: first processed or first file).
  //
  // The previous code only checked the 'preprocessing' phase, which meant
  // any user dataset change within FE was overwritten on the next remount
  // with the preprocessing phase's dataset. Reported by user: "everytime a
  // go away from the draft pipeline of FE, to some other tab or the page
  // is refreshed, it switches to a single datafile again and again."
  useEffect(() => {
    if (!selectedDataset && datasetFiles.length > 0) {
      const persistedId = getPreviousPhaseDataset(projectId, 'feature-engineering', 'preprocessing');
      const match = persistedId
        ? datasetFiles.find(f => f.id === persistedId || f.metadata?.datasetId === persistedId)
        : undefined;
      setSelectedDataset(match?.id ?? pickBestDataset(datasetFiles).id);
    }
  }, [datasetFiles, selectedDataset, projectId]);

  // --- Persist selected dataset for cross-phase continuity ---
  useEffect(() => {
    if (selectedDataset) persistPhaseDataset(projectId, 'feature-engineering', selectedDataset);
  }, [selectedDataset, projectId]);

  // --- Target column sync effect ---
  useEffect(() => {
    if (!selectedDatasetFile) return;
    const columns = selectedDatasetFile.metadata?.columns ?? [];
    if (columns.length === 0) return;

    if (!targetColumn || !columns.includes(targetColumn)) {
      setTargetColumn(columns[0]);
    }
  }, [selectedDatasetFile, targetColumn]);

  return {
    selectedDataset,
    setSelectedDataset,
    targetColumn,
    setTargetColumn,
    datasetFiles,
    documentFiles,
    selectedDatasetFile,
    datasetColumns,
    versions,
    currentVersionId,
    currentVersion,
    chatSessionVersion,
    isApproved,
    isCurrentVersionDraft,
    projectFeatures,
    activeFeatures,
    featureById,
    featureSteps,
    currentStage,
    readinessReport,
    isReadyForApproval,
    readinessReportUnlocked,
    isReadinessExpanded,
    setIsReadinessExpanded,
    outputName,
    setOutputName,
    outputFormat,
    setOutputFormat,
    applyStatus,
    applyMessage,
    panelError,
    setPanelError,
    suggestionDrafts,
    toggleSuggestion,
    updateSuggestionControl,
    handleApplyFeatures,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft,
    handleRenameDraft,
    handleReplay,
    handleReset,
    renameDialogOpen,
    setRenameDialogOpen,
    renameDialogValue,
    setRenameDialogValue,
    handleRenameConfirm,
    deleteDialogOpen,
    setDeleteDialogOpen,
    handleDeleteConfirm,
    approveVersion
  };
}

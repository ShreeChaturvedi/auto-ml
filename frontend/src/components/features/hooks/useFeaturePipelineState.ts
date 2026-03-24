import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { useWorkflowSessionStore, buildWorkflowSessionKey } from '@/stores/workflowSessionStore';
import { fetchFeatureRun } from '@/lib/api/featureEngineering';
import type { FeatureSpec, PipelineVersion, ReadinessReport } from '@/types/feature';
import { useFeatureReadiness } from './useFeatureReadiness';
import { useFeatureCodeGen } from './useFeatureCodeGen';
import { useFeatureVersioning } from './useFeatureVersioning';
import { useFeatureApply } from './useFeatureApply';
import { useSuggestionDrafts } from './useSuggestionDrafts';
import type { FeatureSuggestionItem } from '../featureEngineeringUtils';

export type { SuggestionDraft } from './useSuggestionDrafts';

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
  isApproved: boolean;
  isCurrentVersionDraft: boolean;

  // Feature state
  projectFeatures: FeatureSpec[];
  activeFeatures: FeatureSpec[];
  featureById: Map<string, FeatureSpec>;

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

export function useFeaturePipelineState(projectId: string): UseFeaturePipelineStateReturn {
  // --- Data store ---
  const allFiles = useDataStore((state) => state.files);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

  // --- Feature store selectors ---
  const features = useFeatureStore((state) => state.features);
  const hydrateFeatures = useFeatureStore((state) => state.hydrateFromProject);

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

        const currentVersionId = store.currentVersionId[projectId];
        const storageKey = `feature-engineering-messages-v3-${currentVersionId ?? 'default'}`;
        const sessionKey = buildWorkflowSessionKey(projectId, storageKey);
        const session = useWorkflowSessionStore.getState().getSession(sessionKey);

        if (session?.runId) {
          const { run } = await fetchFeatureRun(session.runId);
          if (cancelled) {
            return;
          }
          hydrateRunIntoStore(run);
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
    projectFeatures,
    selectedDatasetFile,
    setSelectedDataset,
  });

  // --- Suggestion drafts (extracted hook) ---
  const {
    suggestionDrafts,
    setSuggestionDrafts,
    toggleSuggestion,
    updateSuggestionControl,
  } = useSuggestionDrafts({
    projectId,
    featureById,
    setPanelError,
  });

  // --- Versioning (extracted hook) ---
  const {
    versions,
    currentVersionId,
    currentVersion,
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
    setSuggestionDrafts,
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

  // --- Code preview sync (extracted hook) ---
  useFeatureCodeGen(activeFeatures, selectedDatasetFile);

  // --- Default dataset selection effect ---
  useEffect(() => {
    if (!selectedDataset && datasetFiles.length > 0) {
      setSelectedDataset(datasetFiles[0].id);
    }
  }, [datasetFiles, selectedDataset]);

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
    isApproved,
    isCurrentVersionDraft,
    projectFeatures,
    activeFeatures,
    featureById,
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

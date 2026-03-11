import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildSuggestionDefaults,
  type FeatureSuggestionItem
} from '../featureEngineeringUtils';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import type { FeatureCategory, FeatureMethod, FeatureSpec, PipelineVersion, ReadinessReport } from '@/types/feature';
import { FEATURE_TEMPLATES } from '@/lib/features/featureTemplates';
import { useFeatureReadiness } from './useFeatureReadiness';
import { useFeatureCodeGen } from './useFeatureCodeGen';
import { useFeatureVersioning } from './useFeatureVersioning';
import { useFeatureApply } from './useFeatureApply';

const methodCategoryMap = new Map<FeatureMethod, FeatureCategory>(
  FEATURE_TEMPLATES.map((template) => [template.method, template.category])
);

export type SuggestionDraft = {
  enabled: boolean;
  params: Record<string, unknown>;
};

interface UseFeaturePipelineStateReturn {
  // Dataset state
  selectedDataset: string | null;
  setSelectedDataset: (id: string | null) => void;
  targetColumn: string | undefined;
  setTargetColumn: (column: string | undefined) => void;
  files: ReturnType<typeof useDataStore.getState>['files'];
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
  canDeleteCurrentDraft: boolean;

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
  suggestionDrafts: Record<string, SuggestionDraft>;
  toggleSuggestion: (item: FeatureSuggestionItem, enabled: boolean) => void;
  updateSuggestionControl: (item: FeatureSuggestionItem, key: string, value: unknown) => void;

  // Actions
  handleApplyFeatures: () => Promise<void>;
  handleVersionSwitch: (value: string) => void;
  handleNewDraft: () => void;
  handleDeleteDraft: () => void;
  handleRenameDraft: () => void;

  // Store actions (passed through for toolbar/approval gate)
  approveVersion: (projectId: string, versionId: string) => void;
}

export function useFeaturePipelineState(projectId: string): UseFeaturePipelineStateReturn {
  // --- Data store ---
  const allFiles = useDataStore((state) => state.files);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

  // --- Feature store selectors ---
  const features = useFeatureStore((state) => state.features);
  const upsertFeature = useFeatureStore((state) => state.upsertFeature);
  const removeFeature = useFeatureStore((state) => state.removeFeature);
  const hydrateFeatures = useFeatureStore((state) => state.hydrateFromProject);

  // --- Local state ---
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string | undefined>();
  const [panelError, setPanelError] = useState<string | null>(null);
  const [suggestionDrafts, setSuggestionDrafts] = useState<Record<string, SuggestionDraft>>({});

  // --- Refs ---
  const hydratedProjectRef = useRef<string | null>(null);

  // --- Hydration effect ---
  useEffect(() => {
    if (hydratedProjectRef.current === projectId) return;
    hydratedProjectRef.current = projectId;
    hydrateFromBackend(projectId);
    hydrateFeatures(projectId, { force: true });
  }, [hydrateFeatures, hydrateFromBackend, projectId]);

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

  // --- Versioning (extracted hook) ---
  const {
    versions,
    currentVersionId,
    currentVersion,
    isApproved,
    isCurrentVersionDraft,
    canDeleteCurrentDraft,
    approveVersion,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft,
    handleRenameDraft,
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

  // --- Suggestion sync helper ---
  const syncSuggestionToFeatureStore = useCallback(
    (item: FeatureSuggestionItem, draft: SuggestionDraft) => {
      const method = item.feature.method as FeatureMethod;
      const category = methodCategoryMap.get(method);
      if (!category) {
        setPanelError(`Unsupported feature method: ${item.feature.method}`);
        return;
      }

      setPanelError(null);

      if (!draft.enabled) {
        removeFeature(item.id);
        return;
      }

      const feature: FeatureSpec = {
        id: item.id,
        projectId,
        sourceColumn: item.feature.sourceColumn,
        secondaryColumn: item.feature.secondaryColumn,
        featureName: item.feature.featureName,
        description: item.feature.description ?? item.rationale,
        method,
        category,
        params: draft.params,
        enabled: true,
        createdAt: featureById.get(item.id)?.createdAt ?? new Date().toISOString()
      };

      upsertFeature(feature);
    },
    [featureById, projectId, removeFeature, upsertFeature]
  );

  // --- Toggle / update suggestion ---
  const toggleSuggestion = useCallback(
    (item: FeatureSuggestionItem, enabled: boolean) => {
      setSuggestionDrafts((previous) => {
        const current = previous[item.id] ?? {
          enabled: featureById.get(item.id)?.enabled ?? false,
          params: featureById.get(item.id)?.params ?? buildSuggestionDefaults(item)
        };
        const next: SuggestionDraft = { ...current, enabled };
        syncSuggestionToFeatureStore(item, next);
        return { ...previous, [item.id]: next };
      });
    },
    [featureById, syncSuggestionToFeatureStore]
  );

  const updateSuggestionControl = useCallback(
    (item: FeatureSuggestionItem, key: string, value: unknown) => {
      setSuggestionDrafts((previous) => {
        const current = previous[item.id] ?? {
          enabled: featureById.get(item.id)?.enabled ?? false,
          params: featureById.get(item.id)?.params ?? buildSuggestionDefaults(item)
        };
        const next: SuggestionDraft = {
          ...current,
          params: { ...current.params, [key]: value }
        };

        if (next.enabled) {
          syncSuggestionToFeatureStore(item, next);
        }

        return { ...previous, [item.id]: next };
      });
    },
    [featureById, syncSuggestionToFeatureStore]
  );

  return {
    // Dataset state
    selectedDataset,
    setSelectedDataset,
    targetColumn,
    setTargetColumn,
    files,
    datasetFiles,
    documentFiles,
    selectedDatasetFile,
    datasetColumns,

    // Version state
    versions,
    currentVersionId,
    currentVersion,
    isApproved,
    isCurrentVersionDraft,
    canDeleteCurrentDraft,

    // Feature state
    projectFeatures,
    activeFeatures,
    featureById,

    // Readiness
    readinessReport,
    isReadyForApproval,
    readinessReportUnlocked,
    isReadinessExpanded,
    setIsReadinessExpanded,

    // Apply state
    outputName,
    setOutputName,
    outputFormat,
    setOutputFormat,
    applyStatus,
    applyMessage,

    // Errors
    panelError,
    setPanelError,

    // Suggestion drafts
    suggestionDrafts,
    toggleSuggestion,
    updateSuggestionControl,

    // Actions
    handleApplyFeatures,
    handleVersionSwitch,
    handleNewDraft,
    handleDeleteDraft,
    handleRenameDraft,

    // Store actions
    approveVersion
  };
}

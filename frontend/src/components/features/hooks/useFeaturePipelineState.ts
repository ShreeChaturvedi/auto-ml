import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildReadinessReport,
  buildSuggestionDefaults,
  hasRequiredReadinessEvidence,
  type FeatureSuggestionItem
} from '../featureEngineeringUtils';
import { applyFeatureEngineering } from '@/lib/api/featureEngineering';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { useNotebookStore } from '@/stores/notebookStore';
import type { FeatureCategory, FeatureMethod, FeatureSpec, PipelineVersion } from '@/types/feature';
import { FEATURE_TEMPLATES } from '@/lib/features/featureTemplates';

const EMPTY_PIPELINE_VERSIONS: PipelineVersion[] = [];
const FEATURE_PREVIEW_CELL_TITLE = 'Feature Pipeline Preview';

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
  readinessReport: ReturnType<typeof buildReadinessReport>;
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
  // --- Notebook store ---
  const notebookCells = useNotebookStore((state) => state.cells);
  const createNotebookCell = useNotebookStore((state) => state.createCell);
  const updateNotebookCell = useNotebookStore((state) => state.updateCell);

  // --- Data store ---
  const allFiles = useDataStore((state) => state.files);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

  // --- Feature store selectors ---
  const features = useFeatureStore((state) => state.features);
  const upsertFeature = useFeatureStore((state) => state.upsertFeature);
  const removeFeature = useFeatureStore((state) => state.removeFeature);
  const clearProjectFeatures = useFeatureStore((state) => state.clearProjectFeatures);
  const hydrateFeatures = useFeatureStore((state) => state.hydrateFromProject);
  const versions = useFeatureStore((state) => state.versions[projectId] ?? EMPTY_PIPELINE_VERSIONS);
  const hasHydratedVersions = useFeatureStore((state) =>
    Object.prototype.hasOwnProperty.call(state.versions, projectId)
  );
  const hasHydratedCurrentVersion = useFeatureStore((state) =>
    Object.prototype.hasOwnProperty.call(state.currentVersionId, projectId)
  );
  const currentVersionId = useFeatureStore((state) => state.currentVersionId[projectId]);
  const createDraftVersion = useFeatureStore((state) => state.createDraftVersion);
  const removeVersion = useFeatureStore((state) => state.removeVersion);
  const renameVersion = useFeatureStore((state) => state.renameVersion);
  const approveVersion = useFeatureStore((state) => state.approveVersion);
  const setCurrentVersion = useFeatureStore((state) => state.setCurrentVersion);
  const updateReadinessReport = useFeatureStore((state) => state.updateReadinessReport);

  // --- Local state ---
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string | undefined>();
  const [outputName, setOutputName] = useState('');
  const [outputFormat, setOutputFormat] = useState<'csv' | 'json' | 'xlsx'>('csv');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isReadinessExpanded, setIsReadinessExpanded] = useState(false);
  const [suggestionDrafts, setSuggestionDrafts] = useState<Record<string, SuggestionDraft>>({});

  // --- Refs ---
  const hydratedProjectRef = useRef<string | null>(null);
  const lastPersistedReadinessRef = useRef(new Map<string, string>());
  const lastSyncedCodePreviewRef = useRef('');

  // --- Hydration effect ---
  useEffect(() => {
    if (hydratedProjectRef.current === projectId) return;
    hydratedProjectRef.current = projectId;
    hydrateFromBackend(projectId);
    hydrateFeatures(projectId, { force: true });
  }, [hydrateFeatures, hydrateFromBackend, projectId]);

  // --- Version bootstrap effect ---
  useEffect(() => {
    if (!hasHydratedVersions || !hasHydratedCurrentVersion) return;

    if (versions.length === 0) {
      createDraftVersion(projectId, 'Draft Pipeline v1');
      return;
    }

    if (!currentVersionId && versions[0]) {
      setCurrentVersion(projectId, versions[0].id);
    }
  }, [
    createDraftVersion,
    currentVersionId,
    hasHydratedCurrentVersion,
    hasHydratedVersions,
    projectId,
    setCurrentVersion,
    versions
  ]);

  // --- Apply message auto-dismiss effect ---
  useEffect(() => {
    if (!applyMessage) return;
    const timer = setTimeout(() => {
      setApplyMessage(null);
      setApplyStatus('idle');
    }, 4000);
    return () => clearTimeout(timer);
  }, [applyMessage]);

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

  // --- Derived version data ---
  const currentVersion = useMemo(() => {
    if (!currentVersionId) return versions[0];
    return versions.find((version) => version.id === currentVersionId) ?? versions[0];
  }, [currentVersionId, versions]);

  const isApproved = currentVersion?.status === 'approved';
  const isCurrentVersionDraft = currentVersion?.status === 'draft';
  const canDeleteCurrentDraft = Boolean(isCurrentVersionDraft);

  // --- Readiness report ---
  const computedReadinessReport = useMemo(
    () => buildReadinessReport(activeFeatures, datasetColumns),
    [activeFeatures, datasetColumns]
  );

  const readinessReport = currentVersion?.readinessReport ?? computedReadinessReport;

  const isReadyForApproval = Boolean(currentVersion)
    && activeFeatures.length > 0
    && hasRequiredReadinessEvidence(readinessReport);

  const readinessReportUnlocked = activeFeatures.length > 0;

  // --- Readiness collapse effect ---
  useEffect(() => {
    if (!readinessReportUnlocked && isReadinessExpanded) {
      setIsReadinessExpanded(false);
    }
  }, [isReadinessExpanded, readinessReportUnlocked]);

  // --- Default dataset selection effect ---
  useEffect(() => {
    if (!selectedDataset && datasetFiles.length > 0) {
      setSelectedDataset(datasetFiles[0].id);
    }
  }, [datasetFiles, selectedDataset]);

  // --- Output format sync effect ---
  useEffect(() => {
    if (!selectedDatasetFile) return;

    if (selectedDatasetFile.type === 'excel') {
      setOutputFormat('xlsx');
      return;
    }

    if (selectedDatasetFile.type === 'json') {
      setOutputFormat('json');
      return;
    }

    setOutputFormat('csv');
  }, [selectedDatasetFile]);

  // --- Target column sync effect ---
  useEffect(() => {
    if (!selectedDatasetFile) return;
    const columns = selectedDatasetFile.metadata?.columns ?? [];
    if (columns.length === 0) return;

    if (!targetColumn || !columns.includes(targetColumn)) {
      setTargetColumn(columns[0]);
    }
  }, [selectedDatasetFile, targetColumn]);

  // --- Readiness report persist effect ---
  useEffect(() => {
    if (!currentVersion) return;

    const versionKey = currentVersion.id;
    const nextSerialized = JSON.stringify(computedReadinessReport);
    const persistedSerialized = lastPersistedReadinessRef.current.get(versionKey);

    if (persistedSerialized === nextSerialized) return;

    const currentSerialized = JSON.stringify(currentVersion.readinessReport);
    if (currentSerialized === nextSerialized) {
      lastPersistedReadinessRef.current.set(versionKey, nextSerialized);
      return;
    }

    lastPersistedReadinessRef.current.set(versionKey, nextSerialized);
    updateReadinessReport(projectId, currentVersion.id, computedReadinessReport);
  }, [computedReadinessReport, currentVersion, projectId, updateReadinessReport]);

  // --- Code preview sync ---
  const codePreview = useMemo(() => {
    if (!selectedDatasetFile) return '';
    if (activeFeatures.length === 0) return '';

    return generateFeatureEngineeringCode(activeFeatures, selectedDatasetFile.name, {
      datasetId: selectedDatasetFile.metadata?.datasetId,
      includeComments: true
    });
  }, [activeFeatures, selectedDatasetFile]);

  useEffect(() => {
    if (!codePreview.trim()) return;
    if (lastSyncedCodePreviewRef.current === codePreview) return;

    const existingPreviewCell = notebookCells.find(
      (cell) => cell.cellType === 'code' && cell.title === FEATURE_PREVIEW_CELL_TITLE
    );

    const syncCodePreview = async () => {
      if (existingPreviewCell) {
        if (existingPreviewCell.content === codePreview) {
          lastSyncedCodePreviewRef.current = codePreview;
          return;
        }

        const updated = await updateNotebookCell(existingPreviewCell.cellId, {
          title: FEATURE_PREVIEW_CELL_TITLE,
          content: codePreview
        });

        if (updated) {
          lastSyncedCodePreviewRef.current = codePreview;
        }
        return;
      }

      const created = await createNotebookCell({
        cellType: 'code',
        title: FEATURE_PREVIEW_CELL_TITLE,
        content: codePreview
      });

      if (created) {
        lastSyncedCodePreviewRef.current = codePreview;
      }
    };

    void syncCodePreview();
  }, [codePreview, createNotebookCell, notebookCells, updateNotebookCell]);

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

  // --- Apply features handler ---
  const handleApplyFeatures = useCallback(async () => {
    if (!selectedDatasetFile?.metadata?.datasetId) return;

    const enabledFeatures = projectFeatures.filter((feature) => feature.enabled);
    if (enabledFeatures.length === 0) {
      setApplyStatus('error');
      setApplyMessage('Select at least one feature.');
      return;
    }

    const missingSecondary = enabledFeatures.find(
      (feature) =>
        ['ratio', 'difference', 'product'].includes(feature.method) && !feature.secondaryColumn
    );

    if (missingSecondary) {
      setApplyStatus('error');
      setApplyMessage(`"${missingSecondary.featureName}" needs a secondary column.`);
      return;
    }

    const missingTarget = enabledFeatures.find(
      (feature) =>
        feature.method === 'target_encode' && typeof feature.params?.targetColumn !== 'string'
    );

    if (missingTarget) {
      setApplyStatus('error');
      setApplyMessage(`"${missingTarget.featureName}" needs a target column.`);
      return;
    }

    setApplyStatus('loading');
    setApplyMessage(null);

    try {
      const response = await applyFeatureEngineering({
        projectId,
        datasetId: selectedDatasetFile.metadata.datasetId,
        outputName: outputName.trim() || undefined,
        outputFormat,
        features: enabledFeatures
      });

      await hydrateFromBackend(projectId, { force: true });
      setSelectedDataset(response.dataset.datasetId);
      setApplyStatus('success');
      setApplyMessage(`Created ${response.dataset.filename}`);
      setOutputName('');
    } catch (error) {
      setApplyStatus('error');
      setApplyMessage(error instanceof Error ? error.message : 'Failed to apply features.');
    }
  }, [hydrateFromBackend, outputFormat, outputName, projectFeatures, projectId, selectedDatasetFile]);

  // --- Version actions ---
  const handleVersionSwitch = useCallback(
    (value: string) => {
      setPanelError(null);
      setCurrentVersion(projectId, value);
    },
    [projectId, setCurrentVersion]
  );

  const handleNewDraft = useCallback(() => {
    createDraftVersion(projectId, 'New Draft Pipeline');
    clearProjectFeatures(projectId);
    setSuggestionDrafts({});
    setPanelError(null);
    setApplyStatus('idle');
    setApplyMessage(null);
  }, [clearProjectFeatures, createDraftVersion, projectId]);

  const handleDeleteDraft = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;

    const shouldDelete = window.confirm(
      versions.length <= 1
        ? `Delete draft "${currentVersion.name}"? A fresh blank draft will be created.`
        : `Delete draft "${currentVersion.name}"?`
    );
    if (!shouldDelete) return;

    if (versions.length <= 1) {
      const deletedVersionId = currentVersion.id;
      createDraftVersion(projectId, 'Draft Pipeline v1');
      removeVersion(projectId, deletedVersionId);
    } else {
      removeVersion(projectId, currentVersion.id);
    }
    clearProjectFeatures(projectId);
    setSuggestionDrafts({});
    setApplyStatus('idle');
    setApplyMessage(null);
    setPanelError(null);
  }, [clearProjectFeatures, createDraftVersion, currentVersion, projectId, removeVersion, versions.length]);

  const handleRenameDraft = useCallback(() => {
    if (!currentVersion || currentVersion.status !== 'draft') return;
    const nextName = window.prompt('Rename current draft pipeline:', currentVersion.name);
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed) {
      setPanelError('Draft name cannot be empty.');
      return;
    }
    renameVersion(projectId, currentVersion.id, trimmed);
    setPanelError(null);
  }, [currentVersion, projectId, renameVersion]);

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

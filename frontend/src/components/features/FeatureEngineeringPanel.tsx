import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { AgenticShell } from '@/components/agentic/AgenticShell';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { createFeatureEngineeringAdapter } from './FeatureEngineeringAdapter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import { applyFeatureEngineering } from '@/lib/api/featureEngineering';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import { cn } from '@/lib/utils';

import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { useNotebookStore } from '@/stores/notebookStore';

import { FEATURE_TEMPLATES } from '@/types/feature';
import type {
  FeatureCategory,
  FeatureMethod,
  FeatureSpec,
  PipelineVersion,
  ReadinessReport,
  TransformationStep
} from '@/types/feature';
import type { ChatMessage, UiItem, UiSchema } from '@/types/llmUi';

import {
  AlertTriangle,
  Beaker,
  CheckCircle2,
  Copy,
  Database,
  FileOutput,
  History,
  Info,
  Loader2,
  Sparkles,
  WandSparkles
} from 'lucide-react';

interface FeatureEngineeringPanelProps {
  projectId: string;
}

type FeatureSuggestionItem = Extract<UiItem, { type: 'feature_suggestion' }>;

type SuggestionDraft = {
  enabled: boolean;
  params: Record<string, unknown>;
};

const EMPTY_PIPELINE_VERSIONS: PipelineVersion[] = [];
const HIDDEN_ACTIVITY_TOOLS = new Set(['set_active_dataset', 'list_project_datasets', 'profile_active_dataset']);
const VERSION_ACTION_NEW_DRAFT = '__new_draft__';
const VERSION_ACTION_DELETE_DRAFT = '__delete_draft__';
const VERSION_ACTION_RENAME_DRAFT = '__rename_draft__';
const HIDDEN_LEGACY_ERROR_MESSAGES = new Set([
  'LLM render_ui returned empty UI content.',
  'LLM returned empty response.',
  'This operation was aborted'
]);

const methodCategoryMap = new Map<FeatureMethod, FeatureCategory>(
  FEATURE_TEMPLATES.map((template) => [template.method, template.category])
);

const stripAssistantArtifacts = (text: string): string => {
  if (!text) return '';
  let cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '');
  const markerIndex = cleaned.indexOf('<<<JSON>>>');
  if (markerIndex !== -1) {
    cleaned = cleaned.slice(0, markerIndex);
  }
  const endIndex = cleaned.indexOf('<<<END>>>');
  if (endIndex !== -1) {
    cleaned = cleaned.slice(0, endIndex);
  }
  const jsonIndex = cleaned.search(/{\s*"version"\s*:\s*"1"/);
  if (jsonIndex !== -1) {
    cleaned = cleaned.slice(0, jsonIndex);
  }
  return cleaned.trim();
};

const hasUiItems = (ui: UiSchema | null): boolean =>
  Boolean(ui?.sections.some((section) => section.items.length > 0));

function buildReadinessReport(features: FeatureSpec[], sourceColumns: string[]): ReadinessReport {
  const addedColumns = features
    .map((feature) => feature.featureName)
    .filter((name): name is string => Boolean(name?.trim()));
  const uniqueAddedColumns = Array.from(new Set(addedColumns));

  const steps: TransformationStep[] = features.map((feature, index) => ({
    id: feature.id,
    name: feature.featureName || `${feature.sourceColumn}_${feature.method}`,
    rationale: feature.description || `Apply ${feature.method} to ${feature.sourceColumn}`,
    codeReference: `pipeline.step.${index + 1}:${feature.id}`,
    method: feature.method,
    columns: [feature.sourceColumn, feature.secondaryColumn].filter(
      (column): column is string => Boolean(column)
    )
  }));

  const missingSourceColumns = features
    .filter((feature) => !sourceColumns.includes(feature.sourceColumn))
    .map((feature) => feature.sourceColumn);

  const warnings: string[] = [];
  if (features.some((feature) => feature.method === 'target_encode')) {
    warnings.push('Target encoding requires split-aware fitting to avoid leakage.');
  }
  if (missingSourceColumns.length > 0) {
    warnings.push(`Some source columns are missing in the selected dataset: ${Array.from(new Set(missingSourceColumns)).join(', ')}`);
  }
  if (features.length === 0) {
    warnings.push('No transformations enabled. Pipeline currently preserves raw inputs.');
  }

  return {
    dataSummary: {
      addedColumns: uniqueAddedColumns,
      removedColumns: [],
      renamedColumns: [],
      typeChanges: [],
      nullDeltas: [],
      warnings
    },
    steps
  };
}

function hasRequiredReadinessEvidence(report: ReadinessReport): boolean {
  return report.steps.length > 0
    && report.dataSummary.addedColumns.length > 0
    && Array.isArray(report.dataSummary.warnings);
}

function buildSuggestionDefaults(item: FeatureSuggestionItem): Record<string, unknown> {
  const controlDefaults = (item.controls ?? []).reduce<Record<string, unknown>>((acc, control) => {
    acc[control.key] = control.value;
    return acc;
  }, {});

  return {
    ...(item.feature.params ?? {}),
    ...controlDefaults
  };
}

export function FeatureEngineeringPanel({ projectId }: FeatureEngineeringPanelProps) {
  const initializeNotebook = useNotebookStore((state) => state.initializeNotebook);
  const disconnectNotebook = useNotebookStore((state) => state.disconnect);

  const allFiles = useDataStore((state) => state.files);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

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

  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string | undefined>();

  const [outputName, setOutputName] = useState('');
  const [outputFormat, setOutputFormat] = useState<'csv' | 'json' | 'xlsx'>('csv');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [suggestionDrafts, setSuggestionDrafts] = useState<Record<string, SuggestionDraft>>({});

  const hydratedProjectRef = useRef<string | null>(null);
  const lastPersistedReadinessRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!projectId) return;
    void initializeNotebook(projectId);
    return () => disconnectNotebook();
  }, [disconnectNotebook, initializeNotebook, projectId]);

  useEffect(() => {
    if (hydratedProjectRef.current === projectId) return;
    hydratedProjectRef.current = projectId;
    hydrateFromBackend(projectId);
    hydrateFeatures(projectId, { force: true });
  }, [hydrateFeatures, hydrateFromBackend, projectId]);

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

  useEffect(() => {
    if (!applyMessage) return;
    const timer = setTimeout(() => {
      setApplyMessage(null);
      setApplyStatus('idle');
    }, 4000);

    return () => clearTimeout(timer);
  }, [applyMessage]);

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

  const projectFeatures = useMemo(
    () => features.filter((feature) => feature.projectId === projectId),
    [features, projectId]
  );

  const activeFeatures = useMemo(
    () => projectFeatures.filter((feature) => feature.enabled),
    [projectFeatures]
  );

  const featureById = useMemo(() => {
    return new Map(projectFeatures.map((feature) => [feature.id, feature]));
  }, [projectFeatures]);

  const currentVersion = useMemo(() => {
    if (!currentVersionId) return versions[0];
    return versions.find((version) => version.id === currentVersionId) ?? versions[0];
  }, [currentVersionId, versions]);

  const isApproved = currentVersion?.status === 'approved';

  const computedReadinessReport = useMemo(
    () => buildReadinessReport(activeFeatures, datasetColumns),
    [activeFeatures, datasetColumns]
  );

  const readinessReport = currentVersion?.readinessReport ?? computedReadinessReport;

  const isReadyForApproval = Boolean(currentVersion)
    && activeFeatures.length > 0
    && hasRequiredReadinessEvidence(readinessReport);

  const isCurrentVersionDraft = currentVersion?.status === 'draft';
  const canDeleteCurrentDraft = Boolean(isCurrentVersionDraft);

  useEffect(() => {
    if (!selectedDataset && datasetFiles.length > 0) {
      setSelectedDataset(datasetFiles[0].id);
    }
  }, [datasetFiles, selectedDataset]);

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

  useEffect(() => {
    if (!selectedDatasetFile) return;
    const columns = selectedDatasetFile.metadata?.columns ?? [];
    if (columns.length === 0) return;

    if (!targetColumn || !columns.includes(targetColumn)) {
      setTargetColumn(columns[0]);
    }
  }, [selectedDatasetFile, targetColumn]);

  useEffect(() => {
    if (!currentVersion) return;

    const versionKey = currentVersion.id;
    const nextSerialized = JSON.stringify(computedReadinessReport);
    const persistedSerialized = lastPersistedReadinessRef.current.get(versionKey);

    if (persistedSerialized === nextSerialized) {
      return;
    }

    const currentSerialized = JSON.stringify(currentVersion.readinessReport);
    if (currentSerialized === nextSerialized) {
      lastPersistedReadinessRef.current.set(versionKey, nextSerialized);
      return;
    }

    lastPersistedReadinessRef.current.set(versionKey, nextSerialized);
    updateReadinessReport(projectId, currentVersion.id, computedReadinessReport);
  }, [computedReadinessReport, currentVersion, projectId, updateReadinessReport]);

  const syncSuggestionToFeatureStore = useCallback((
    item: FeatureSuggestionItem,
    draft: SuggestionDraft
  ) => {
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
  }, [featureById, projectId, removeFeature, upsertFeature]);

  const toggleSuggestion = useCallback((item: FeatureSuggestionItem, enabled: boolean) => {
    setSuggestionDrafts((previous) => {
      const current = previous[item.id] ?? {
        enabled: featureById.get(item.id)?.enabled ?? false,
        params: featureById.get(item.id)?.params ?? buildSuggestionDefaults(item)
      };
      const next: SuggestionDraft = {
        ...current,
        enabled
      };
      syncSuggestionToFeatureStore(item, next);
      return {
        ...previous,
        [item.id]: next
      };
    });
  }, [featureById, syncSuggestionToFeatureStore]);

  const updateSuggestionControl = useCallback((item: FeatureSuggestionItem, key: string, value: unknown) => {
    setSuggestionDrafts((previous) => {
      const current = previous[item.id] ?? {
        enabled: featureById.get(item.id)?.enabled ?? false,
        params: featureById.get(item.id)?.params ?? buildSuggestionDefaults(item)
      };
      const next: SuggestionDraft = {
        ...current,
        params: {
          ...current.params,
          [key]: value
        }
      };

      if (next.enabled) {
        syncSuggestionToFeatureStore(item, next);
      }

      return {
        ...previous,
        [item.id]: next
      };
    });
  }, [featureById, syncSuggestionToFeatureStore]);

  const handleApplyFeatures = useCallback(async () => {
    if (!selectedDatasetFile?.metadata?.datasetId) return;

    const enabledFeatures = projectFeatures.filter((feature) => feature.enabled);
    if (enabledFeatures.length === 0) {
      setApplyStatus('error');
      setApplyMessage('Select at least one feature.');
      return;
    }

    const missingSecondary = enabledFeatures.find(
      (feature) => ['ratio', 'difference', 'product'].includes(feature.method) && !feature.secondaryColumn
    );

    if (missingSecondary) {
      setApplyStatus('error');
      setApplyMessage(`"${missingSecondary.featureName}" needs a secondary column.`);
      return;
    }

    const missingTarget = enabledFeatures.find(
      (feature) => feature.method === 'target_encode' && typeof feature.params?.targetColumn !== 'string'
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

  const codePreview = useMemo(() => {
    if (!selectedDatasetFile) return '';
    if (activeFeatures.length === 0) return '';

    return generateFeatureEngineeringCode(activeFeatures, selectedDatasetFile.name, {
      datasetId: selectedDatasetFile.metadata?.datasetId,
      includeComments: true
    });
  }, [activeFeatures, selectedDatasetFile]);

  const adapter = useMemo(() => {
    return createFeatureEngineeringAdapter({
      projectId,
      datasetId: selectedDatasetFile?.metadata?.datasetId,
      targetColumn,
      datasetFiles,
      documentFiles
    });
  }, [datasetFiles, documentFiles, projectId, selectedDatasetFile, targetColumn]);

  const handleVersionSelect = useCallback((value: string) => {
    if (value === VERSION_ACTION_NEW_DRAFT) {
      createDraftVersion(projectId);
      clearProjectFeatures(projectId);
      setSuggestionDrafts({});
      setPanelError(null);
      setApplyStatus('idle');
      setApplyMessage(null);
      return;
    }

    if (value === VERSION_ACTION_DELETE_DRAFT) {
      if (!currentVersion || currentVersion.status !== 'draft') {
        return;
      }

      const shouldDelete = window.confirm(
        versions.length <= 1
          ? `Delete draft "${currentVersion.name}"? Since this is the only version, a fresh blank draft will be created.`
          : `Delete draft "${currentVersion.name}"? This removes this draft version.`
      );
      if (!shouldDelete) {
        return;
      }

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
      return;
    }

    if (value === VERSION_ACTION_RENAME_DRAFT) {
      if (!currentVersion || currentVersion.status !== 'draft') {
        return;
      }

      const nextName = window.prompt('Rename current draft pipeline:', currentVersion.name);
      if (!nextName) {
        return;
      }

      const trimmed = nextName.trim();
      if (!trimmed) {
        setPanelError('Draft name cannot be empty.');
        return;
      }

      renameVersion(projectId, currentVersion.id, trimmed);
      setPanelError(null);
      return;
    }

    setPanelError(null);
    setCurrentVersion(projectId, value);
  }, [
    clearProjectFeatures,
    createDraftVersion,
    currentVersion,
    projectId,
    renameVersion,
    removeVersion,
    setCurrentVersion,
    versions.length
  ]);

  const renderUiItem = useCallback((item: UiItem) => {
    switch (item.type) {
      case 'dataset_summary':
        return (
          <Card key={item.datasetId} className="border-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dataset snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{item.filename}</span>
                <Badge variant="outline" className="text-[10px]">{item.rows} rows</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>{item.columns} columns</span>
                <Badge variant="secondary" className="text-[10px]">{item.datasetId.slice(0, 8)}</Badge>
              </div>
            </CardContent>
          </Card>
        );
      case 'report':
        return (
          <Card key={item.id} className="border-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {item.format === 'markdown' ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{item.content}</p>
              )}
            </CardContent>
          </Card>
        );
      case 'feature_suggestion': {
        const existing = featureById.get(item.id);
        const draft = suggestionDrafts[item.id] ?? {
          enabled: existing?.enabled ?? false,
          params: existing?.params ?? buildSuggestionDefaults(item)
        };

        return (
          <Card key={item.id} className={cn('border', draft.enabled && 'border-foreground/40')}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{item.feature.featureName}</p>
                  <p className="text-xs text-muted-foreground">{item.rationale}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'text-xs',
                    draft.enabled
                      ? 'border-foreground/50 bg-foreground/10 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => toggleSuggestion(item, !draft.enabled)}
                  disabled={isApproved}
                >
                  {draft.enabled ? 'Enabled' : 'Enable'}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5">{item.feature.method}</span>
                <span className="rounded bg-muted px-2 py-0.5">{item.impact} impact</span>
              </div>

              {item.controls?.length ? (
                <div className="grid gap-3">
                  {item.controls.map((control) => {
                    const controlValue = draft.params[control.key] ?? control.value;

                    return (
                      <div key={control.key} className="space-y-1">
                        <Label className="text-xs">{control.label}</Label>
                        {control.type === 'boolean' ? (
                          <Switch
                            checked={Boolean(controlValue)}
                            onCheckedChange={(checked) => updateSuggestionControl(item, control.key, checked)}
                            disabled={isApproved}
                          />
                        ) : (control.type === 'select' || control.type === 'column') && (control.options || datasetColumns.length > 0) ? (
                          <Select
                            value={String(controlValue ?? '')}
                            onValueChange={(value) => updateSuggestionControl(item, control.key, value)}
                            disabled={isApproved}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {(control.options ?? datasetColumns.map((column) => ({ value: column, label: column }))).map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={control.type === 'number' ? 'number' : 'text'}
                            value={String(controlValue ?? '')}
                            onChange={(event) => {
                              const nextValue = control.type === 'number'
                                ? event.currentTarget.valueAsNumber
                                : event.currentTarget.value;
                              updateSuggestionControl(
                                item,
                                control.key,
                                Number.isNaN(nextValue as number) ? control.value : nextValue
                              );
                            }}
                            min={control.min}
                            max={control.max}
                            step={control.step}
                            className="h-8 text-xs"
                            disabled={isApproved}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      }
      case 'code_cell':
        return (
          <Card key={item.id} className="border-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{item.title ?? 'Code cell'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                {item.content}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  void navigator.clipboard.writeText(item.content).catch(() => undefined);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy code
              </Button>
            </CardContent>
          </Card>
        );
      case 'callout':
        return (
          <div
            key={item.text}
            className={cn(
              'rounded-md border px-3 py-2 text-xs',
              item.tone === 'warning' && 'border-amber-500/40 text-amber-700',
              item.tone === 'success' && 'border-emerald-500/40 text-emerald-700',
              item.tone === 'info' && 'border-sky-500/30 text-sky-700'
            )}
          >
            {item.text}
          </div>
        );
      default:
        return null;
    }
  }, [datasetColumns, featureById, isApproved, suggestionDrafts, toggleSuggestion, updateSuggestionControl]);

  const LeftPaneComponent = ({
    messages,
    isGenerating,
    error
  }: {
    messages: ChatMessage[];
    isGenerating: boolean;
    error: string | null;
  }) => {
    const toolMessages = useMemo(
      () => messages.filter((message): message is Extract<ChatMessage, { type: 'tool_call' }> => {
        return message.type === 'tool_call' && !HIDDEN_ACTIVITY_TOOLS.has(message.call.tool);
      }),
      [messages]
    );

    const toolCalls = useMemo(() => toolMessages.map((message) => message.call), [toolMessages]);
    const toolResults = useMemo(
      () => toolMessages.flatMap((message) => (message.result ? [message.result] : [])),
      [toolMessages]
    );

    const hasUserMessage = messages.some((message) => message.type === 'user');

    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6 pb-28">
        <Card className={cn(
          'border',
          isApproved ? 'border-emerald-300 bg-emerald-50/70' : 'border-muted bg-muted/30'
        )}>
          <CardContent className="flex items-start justify-between gap-4 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isApproved ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Info className="h-4 w-4 text-muted-foreground" />
                )}
                <p className="text-sm font-semibold">
                  {isApproved ? 'Pipeline Approved' : 'Approval Gate: Readiness Review'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {isApproved
                  ? 'This feature engineering pipeline is locked and ready for training.'
                  : 'Enable features and review readiness evidence before approval.'}
              </p>
            </div>
            <div className="shrink-0">
              {isApproved ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => createDraftVersion(projectId, 'New Draft Pipeline')}
                >
                  Start New Draft
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={!isReadyForApproval}
                  onClick={() => currentVersion && approveVersion(projectId, currentVersion.id)}
                >
                  Approve Pipeline
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {panelError || error ? (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardContent className="flex items-center gap-2 py-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {panelError || error}
            </CardContent>
          </Card>
        ) : null}

        {!hasUserMessage ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Beaker className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Feature Engineering is ready</p>
                <p className="text-xs text-muted-foreground">
                  Ask the agent to propose candidate features, validate risks, and produce executable notebook steps.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-4">
          {messages.map((message) => {
            if (message.type === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg bg-primary/10 px-4 py-2 text-sm whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              );
            }

            if (message.type === 'assistant_text') {
              const cleaned = stripAssistantArtifacts(message.content);
              if (!cleaned) return null;

              return (
                <div key={message.id} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                    <Sparkles className="h-3 w-3 text-emerald-600" />
                  </div>
                  <div className="prose prose-sm max-w-none dark:prose-invert text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleaned}</ReactMarkdown>
                  </div>
                </div>
              );
            }

            if (message.type === 'thinking') {
              return (
                <div key={message.id} className="ml-9 border-l-2 pl-3 text-xs italic text-muted-foreground">
                  Thinking... {message.isComplete ? '' : '(in progress)'}
                </div>
              );
            }

            if (message.type === 'ui') {
              if (!hasUiItems(message.schema)) {
                return null;
              }

              return (
                <div key={message.id} className="ml-9 space-y-4">
                  {message.schema.sections.map((section) => (
                    <div key={section.id} className="space-y-3">
                      {section.title ? <h3 className="text-sm font-semibold">{section.title}</h3> : null}
                      <div
                        className={cn(
                          section.layout === 'grid' && 'grid gap-3',
                          section.layout === 'grid' && section.columns === 2 && 'md:grid-cols-2',
                          section.layout === 'grid' && section.columns === 3 && 'md:grid-cols-3',
                          (!section.layout || section.layout === 'column') && 'space-y-3'
                        )}
                      >
                        {section.items.map(renderUiItem)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }

            if (message.type === 'tool_call') {
              if (HIDDEN_ACTIVITY_TOOLS.has(message.call.tool)) {
                return null;
              }

              return (
                <div key={message.id} className="ml-9 text-xs text-muted-foreground">
                  <span className="font-mono">{message.call.tool}</span>
                  {message.result?.error ? (
                    <span className="ml-2 text-destructive">{message.result.error}</span>
                  ) : null}
                </div>
              );
            }

            if (message.type === 'error') {
              if (HIDDEN_LEGACY_ERROR_MESSAGES.has(message.message)) {
                return null;
              }
              return (
                <div key={message.id} className="ml-9 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {message.message}
                </div>
              );
            }

            return null;
          })}

          <ToolIndicator toolCalls={toolCalls} results={toolResults} isRunning={isGenerating} />

          {isGenerating ? (
            <div className="ml-9 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating feature plan...
            </div>
          ) : null}
        </div>

        <Card className="border-muted/60">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="text-sm">Unified Readiness Report</CardTitle>
            <p className="text-xs text-muted-foreground">
              Tracks enabled transformations and pre-training quality checks.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded border bg-muted/30 p-3">
                <p className="text-muted-foreground">Added columns</p>
                <p className="text-lg font-semibold">{readinessReport.dataSummary.addedColumns.length}</p>
              </div>
              <div className="rounded border bg-muted/30 p-3">
                <p className="text-muted-foreground">Steps</p>
                <p className="text-lg font-semibold">{readinessReport.steps.length}</p>
              </div>
              <div className="rounded border bg-muted/30 p-3">
                <p className="text-muted-foreground">Warnings</p>
                <p className="text-lg font-semibold">{readinessReport.dataSummary.warnings.length}</p>
              </div>
            </div>

            {readinessReport.steps.length > 0 ? (
              <div className="space-y-2">
                {readinessReport.steps.map((step, index) => (
                  <div key={step.id} className="rounded border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{index + 1}. {step.name}</p>
                      <Badge variant="outline" className="text-[10px]">{step.method ?? 'custom'}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{step.rationale}</p>
                    {step.columns?.length ? (
                      <p className="mt-1 text-muted-foreground">Columns: {step.columns.join(', ')}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed p-3 text-muted-foreground">No transformations enabled yet.</p>
            )}

            {readinessReport.dataSummary.warnings.length > 0 ? (
              <div className="space-y-1 rounded border border-amber-300/50 bg-amber-50/50 p-3 text-amber-700">
                <p className="font-medium">Pre-flight checks</p>
                <ul className="list-disc space-y-1 pl-4">
                  {readinessReport.dataSummary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {codePreview ? (
              <div className="space-y-2">
                <p className="font-medium">Code preview</p>
                <pre className="overflow-x-auto rounded border bg-muted/40 p-3 font-mono text-[11px]">
                  {codePreview}
                </pre>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-muted/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Apply Feature Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-xs">Output name (optional)</Label>
                <Input
                  value={outputName}
                  onChange={(event) => setOutputName(event.currentTarget.value)}
                  placeholder="e.g. features_v1"
                  className="h-8 text-xs"
                  disabled={isApproved}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Format</Label>
                <Select
                  value={outputFormat}
                  onValueChange={(value) => setOutputFormat(value as 'csv' | 'json' | 'xlsx')}
                  disabled={isApproved}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="xlsx">XLSX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="h-8 text-xs"
                onClick={handleApplyFeatures}
                disabled={applyStatus === 'loading' || isApproved || activeFeatures.length === 0}
              >
                {applyStatus === 'loading' ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileOutput className="mr-2 h-3.5 w-3.5" />
                )}
                Apply
              </Button>
            </div>

            {applyMessage ? (
              <p className={cn('text-xs', applyStatus === 'error' ? 'text-destructive' : 'text-emerald-600')}>
                {applyMessage}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <AgenticShell
      key={currentVersion?.id ?? 'feature-engineering-default'}
      projectId={projectId}
      storageKey={`feature-engineering-messages-v3-${currentVersion?.id ?? 'default'}`}
      domainAdapter={adapter}
      domainLockReason={
        isApproved
          ? 'This feature pipeline is approved and locked. Start a new draft to continue editing.'
          : undefined
      }
      LeftPaneComponent={LeftPaneComponent}
      toolbarLeft={
        <>
          <WandSparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Feature Engineering</span>
          {currentVersion ? (
            <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
              {currentVersion.name}
            </Badge>
          ) : null}
        </>
      }
      toolbarRight={
        <>
          <Select
            value={currentVersion?.id ?? ''}
            onValueChange={handleVersionSelect}
            disabled={versions.length === 0}
          >
            <SelectTrigger className="h-9 w-[190px]">
              <History className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  {version.name}
                </SelectItem>
              ))}
              <SelectItem value={VERSION_ACTION_NEW_DRAFT}>+ New Draft Pipeline</SelectItem>
              <SelectItem value={VERSION_ACTION_RENAME_DRAFT} disabled={!isCurrentVersionDraft}>
                Rename Current Draft
              </SelectItem>
              <SelectItem value={VERSION_ACTION_DELETE_DRAFT} disabled={!canDeleteCurrentDraft}>
                Delete Current Draft
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={selectedDataset ?? ''}
            onValueChange={setSelectedDataset}
            disabled={datasetFiles.length === 0}
          >
            <SelectTrigger className="h-9 w-[240px]">
              <Database className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasetFiles.map((file) => (
                <SelectItem key={file.id} value={file.id}>
                  {file.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={targetColumn ?? ''}
            onValueChange={setTargetColumn}
            disabled={datasetColumns.length === 0}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue placeholder="Target column" />
            </SelectTrigger>
            <SelectContent>
              {datasetColumns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
      chatMetaSlot={
        <div className="hidden min-w-0 flex-wrap items-center gap-2 sm:flex">
          {selectedDatasetFile ? (
            <Badge variant="outline" className="h-6 max-w-[220px] px-2 text-[11px] font-normal">
              <span className="truncate" title={selectedDatasetFile.name}>{selectedDatasetFile.name}</span>
            </Badge>
          ) : null}
          {targetColumn ? (
            <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
              target: {targetColumn}
            </Badge>
          ) : null}
          <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
            {activeFeatures.length} enabled features
          </Badge>
        </div>
      }
    />
  );
}

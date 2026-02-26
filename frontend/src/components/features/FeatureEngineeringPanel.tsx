import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { applyFeatureEngineering } from '@/lib/api/featureEngineering';
import { executeToolCalls, streamFeaturePlan } from '@/lib/api/llm';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import type { FeatureSpec, FeatureMethod, FeatureCategory, ReadinessReport, TransformationStep } from '@/types/feature';
import { FEATURE_TEMPLATES } from '@/types/feature';
import type { ToolCall, ToolResult, UiItem, UiSchema } from '@/types/llmUi';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { cn } from '@/lib/utils';
import { Loader2, Play, Sparkles, Code, AlertTriangle, CheckCircle2, History, Info, Plus, Beaker, FileText } from 'lucide-react';

interface FeatureEngineeringPanelProps {
  projectId: string;
}

type SuggestionState = {
  item: Extract<UiItem, { type: 'feature_suggestion' }>;
  enabled: boolean;
  params: Record<string, unknown>;
};

const MAX_TOOL_ATTEMPTS = 3;
const AUTO_TOOL_DELAY_MS = 400;

const methodCategoryMap = new Map<FeatureMethod, FeatureCategory>(
  FEATURE_TEMPLATES.map((template) => [template.method, template.category])
);

const stripAssistantArtifacts = (text: string) => {
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

export function FeatureEngineeringPanel({ projectId }: FeatureEngineeringPanelProps) {
  const allFiles = useDataStore((state) => state.files);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

  const features = useFeatureStore((state) => state.features);
  const upsertFeature = useFeatureStore((state) => state.upsertFeature);
  const removeFeature = useFeatureStore((state) => state.removeFeature);
  const hydrateFeatures = useFeatureStore((state) => state.hydrateFromProject);
  const versions = useFeatureStore((state) => state.versions[projectId] || []);
  const currentVersionId = useFeatureStore((state) => state.currentVersionId[projectId]);
  const createDraftVersion = useFeatureStore((state) => state.createDraftVersion);
  const approveVersion = useFeatureStore((state) => state.approveVersion);
  const setCurrentVersion = useFeatureStore((state) => state.setCurrentVersion);
  const updateReadinessReport = useFeatureStore((state) => state.updateReadinessReport);

  const currentVersion = useMemo(() => {
    return versions.find(v => v.id === currentVersionId) || versions[0];
  }, [versions, currentVersionId]);

  const files = useMemo(
    () => allFiles.filter((file) => file.projectId === projectId),
    [allFiles, projectId]
  );
  const datasetFiles = useMemo(
    () => files.filter((file) => ['csv', 'json', 'excel'].includes(file.type)),
    [files]
  );

  const projectFeatures = useMemo(
    () => features.filter((feature) => feature.projectId === projectId),
    [features, projectId]
  );

  const activeFeatures = useMemo(() => projectFeatures.filter((f) => f.enabled), [projectFeatures]);

  const isApproved = currentVersion?.status === 'approved';

  const featureById = useMemo(() => {
    return new Map(projectFeatures.map((feature) => [feature.id, feature]));
  }, [projectFeatures]);

  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string | undefined>();
  const [prompt, setPrompt] = useState('');

  const [assistantText, setAssistantText] = useState('');
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantUi, setAssistantUi] = useState<UiSchema | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunningTools, setIsRunningTools] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionState[]>([]);
  const autoToolRunRef = useRef<string | null>(null);
  const toolHistoryRef = useRef<{ calls: ToolCall[]; results: ToolResult[] }>({ calls: [], results: [] });
  const toolAttemptRef = useRef(0);
  const cleanedAssistantText = useMemo(() => stripAssistantArtifacts(assistantText), [assistantText]);
  const hasRenderableAssistantUi = useMemo(() => hasUiItems(assistantUi), [assistantUi]);

  const [applyStatus, setApplyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [outputName, setOutputName] = useState('');
  const [outputFormat, setOutputFormat] = useState<'csv' | 'json' | 'xlsx'>('csv');

  const abortRef = useRef<AbortController | null>(null);

  const selectedDatasetFile = useMemo(
    () => datasetFiles.find((file) => file.id === selectedDataset),
    [datasetFiles, selectedDataset]
  );
  const datasetColumns = useMemo(
    () => selectedDatasetFile?.metadata?.columns ?? [],
    [selectedDatasetFile]
  );

  const computedReadinessReport = useMemo(
    () => buildReadinessReport(activeFeatures, datasetColumns),
    [activeFeatures, datasetColumns]
  );
  const readinessReport = currentVersion?.readinessReport ?? computedReadinessReport;
  const isReadyForApproval = Boolean(currentVersion)
    && activeFeatures.length > 0
    && hasRequiredReadinessEvidence(readinessReport);

  useEffect(() => {
    hydrateFromBackend(projectId);
    hydrateFeatures(projectId);
  }, [projectId, hydrateFromBackend, hydrateFeatures]);

  useEffect(() => {
    if (versions.length === 0) {
      createDraftVersion(projectId, 'Draft Pipeline v1');
      return;
    }

    if (!currentVersion && versions[0]) {
      setCurrentVersion(projectId, versions[0].id);
    }
  }, [createDraftVersion, currentVersion, projectId, setCurrentVersion, versions]);

  useEffect(() => {
    if (!selectedDataset && datasetFiles.length > 0) {
      setSelectedDataset(datasetFiles[0].id);
    }
  }, [datasetFiles, selectedDataset]);

  useEffect(() => {
    if (!selectedDatasetFile) return;
    if (selectedDatasetFile.type === 'excel') {
      setOutputFormat('xlsx');
    } else if (selectedDatasetFile.type === 'json') {
      setOutputFormat('json');
    } else {
      setOutputFormat('csv');
    }
  }, [selectedDatasetFile]);

  useEffect(() => {
    if (!targetColumn && selectedDatasetFile?.metadata?.columns?.length) {
      setTargetColumn(selectedDatasetFile.metadata.columns[0]);
    }
  }, [selectedDatasetFile, targetColumn]);

  useEffect(() => {
    if (!applyMessage) return;
    const timer = setTimeout(() => {
      setApplyMessage(null);
      setApplyStatus('idle');
    }, 4000);
    return () => clearTimeout(timer);
  }, [applyMessage]);

  useEffect(() => {
    if (!assistantUi) {
      setSuggestions([]);
      return;
    }

    const nextSuggestions: SuggestionState[] = [];
    assistantUi.sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type !== 'feature_suggestion') return;
        const existing = featureById.get(item.id);
        const controlParams = (item.controls ?? []).reduce<Record<string, unknown>>((acc, control) => {
          acc[control.key] = control.value;
          return acc;
        }, {});
        const baseParams = { ...item.feature.params, ...controlParams };
        nextSuggestions.push({
          item,
          enabled: existing?.enabled ?? false,
          params: existing?.params ?? baseParams
        });
      });
    });

    setSuggestions(nextSuggestions);
  }, [assistantUi, featureById]);

  useEffect(() => {
    if (!currentVersion) return;

    const nextSerialized = JSON.stringify(computedReadinessReport);
    const currentSerialized = JSON.stringify(currentVersion.readinessReport);
    if (nextSerialized === currentSerialized) {
      return;
    }

    updateReadinessReport(projectId, currentVersion.id, computedReadinessReport);
  }, [computedReadinessReport, currentVersion, projectId, updateReadinessReport]);

  const resetToolHistory = useCallback(() => {
    toolHistoryRef.current = { calls: [], results: [] };
    setToolCalls([]);
    setToolResults([]);
    toolAttemptRef.current = 0;
  }, []);

  const handleGenerate = useCallback(async (withToolResults?: ToolResult[], withToolCalls?: ToolCall[]) => {
    if (!projectId || !selectedDatasetFile?.metadata?.datasetId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!withToolResults?.length) {
      resetToolHistory();
      toolAttemptRef.current = 0;
    }

    setAssistantText('');
    setAssistantError(null);
    setAssistantUi(null);
    setToolCalls([]);
    setToolResults(withToolResults ?? []);
    setIsGenerating(true);

    try {
      await streamFeaturePlan(
        {
          projectId,
          datasetId: selectedDatasetFile.metadata.datasetId,
          targetColumn,
          prompt: prompt.trim() || undefined,
          toolCalls: withToolCalls?.length ? withToolCalls : undefined,
          toolResults: withToolResults?.length ? withToolResults : undefined
        },
        (event) => {
          if (event.type === 'token') {
            setAssistantText((prev) => prev + event.text);
          }
          if (event.type === 'envelope') {
            const envelopeMessage = typeof event.envelope.message === 'string' ? event.envelope.message : '';
            const cleanedEnvelopeMessage = stripAssistantArtifacts(envelopeMessage);
            if (event.envelope.tool_calls?.length) {
              setToolCalls(event.envelope.tool_calls);
              toolHistoryRef.current.calls = mergeToolCalls(
                toolHistoryRef.current.calls,
                event.envelope.tool_calls
              );
              setAssistantUi(null);
            } else {
              const nextUi = event.envelope.ui ?? null;
              if (nextUi && !hasUiItems(nextUi) && !cleanedEnvelopeMessage) {
                setAssistantUi(null);
                setAssistantError('AI plan finished without visible output. Try again or refine your goal.');
              } else {
                setAssistantUi(hasUiItems(nextUi) ? nextUi : null);
              }
              setToolCalls([]);
            }
            if (envelopeMessage) {
              setAssistantText((prev) => (prev.trim() ? prev : envelopeMessage));
            }
          }
          if (event.type === 'error') {
            setAssistantError(event.message);
          }
          if (event.type === 'done') {
            setIsGenerating(false);
          }
        },
        controller.signal
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setAssistantError(error instanceof Error ? error.message : 'Failed to generate plan.');
      setIsGenerating(false);
    }
  }, [projectId, selectedDatasetFile, targetColumn, prompt, resetToolHistory]);

  const handleRunTools = useCallback(async (auto = false) => {
    if (!toolCalls.length) return;
    if (auto) {
      if (toolAttemptRef.current >= MAX_TOOL_ATTEMPTS) {
        setAssistantError(`Tool execution stopped after ${MAX_TOOL_ATTEMPTS} attempts.`);
        return;
      }
      toolAttemptRef.current += 1;
      await new Promise((resolve) => setTimeout(resolve, AUTO_TOOL_DELAY_MS));
    }
    setIsRunningTools(true);
    try {
      const response = await executeToolCalls(projectId, toolCalls);
      const mergedResults = mergeToolResults(toolHistoryRef.current.results, response.results);
      toolHistoryRef.current.results = mergedResults;
      setToolResults(mergedResults);
      await handleGenerate(mergedResults, toolHistoryRef.current.calls);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : 'Failed to execute tools.');
    } finally {
      setIsRunningTools(false);
    }
  }, [toolCalls, projectId, handleGenerate]);

  // Auto-run tool calls when they arrive
  useEffect(() => {
    if (toolCalls.length === 0 || isRunningTools) return;
    const key = toolCalls.map((call) => call.id).join('|');
    if (autoToolRunRef.current === key) return;
    autoToolRunRef.current = key;
    void handleRunTools(true);
  }, [toolCalls, isRunningTools, handleRunTools]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const mergeToolCalls = (previous: ToolCall[], next: ToolCall[]) => {
    const merged = new Map(previous.map((call) => [call.id, call]));
    next.forEach((call) => merged.set(call.id, call));
    return Array.from(merged.values());
  };

  const mergeToolResults = (previous: ToolResult[], next: ToolResult[]) => {
    const merged = new Map(previous.map((result) => [result.id, result]));
    next.forEach((result) => merged.set(result.id, result));
    return Array.from(merged.values());
  };

  const syncFeature = useCallback((state: SuggestionState, enabled: boolean) => {
    const method = state.item.feature.method as FeatureMethod;
    const category = methodCategoryMap.get(method);
    if (!category) {
      setAssistantError(`Unsupported feature method: ${state.item.feature.method}`);
      return;
    }

    if (!enabled) {
      removeFeature(state.item.id);
      return;
    }

    const feature: FeatureSpec = {
      id: state.item.id,
      projectId,
      sourceColumn: state.item.feature.sourceColumn,
      secondaryColumn: state.item.feature.secondaryColumn,
      featureName: state.item.feature.featureName,
      description: state.item.feature.description ?? state.item.rationale,
      method,
      category,
      params: state.params,
      enabled: true,
      createdAt: featureById.get(state.item.id)?.createdAt ?? new Date().toISOString()
    };

    upsertFeature(feature);
  }, [featureById, projectId, removeFeature, upsertFeature]);

  const handleToggleSuggestion = useCallback((id: string, enabled: boolean) => {
    setSuggestions((prev) =>
      prev.map((state) => {
        if (state.item.id !== id) return state;
        const next = { ...state, enabled };
        syncFeature(next, enabled);
        return next;
      })
    );
  }, [syncFeature]);

  const handleControlChange = useCallback((id: string, key: string, value: unknown) => {
    setSuggestions((prev) =>
      prev.map((state) => {
        if (state.item.id !== id) return state;
        const next = {
          ...state,
          params: {
            ...state.params,
            [key]: value
          }
        };
        if (state.enabled) {
          syncFeature(next, true);
        }
        return next;
      })
    );
  }, [syncFeature]);

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

  const codePreview = useMemo(() => {
    if (!selectedDatasetFile) return '';
    const enabled = projectFeatures.filter((feature) => feature.enabled);
    if (enabled.length === 0) return '';
    return generateFeatureEngineeringCode(enabled, selectedDatasetFile.name, {
      datasetId: selectedDatasetFile.metadata?.datasetId,
      includeComments: true
    });
  }, [projectFeatures, selectedDatasetFile]);

  const renderItem = (item: UiItem) => {
    switch (item.type) {
      case 'dataset_summary':
        return (
          <Card key={item.datasetId} className="border-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dataset snapshot</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <div className="flex items-center justify-between">
                <span>{item.filename}</span>
                <Badge variant="outline" className="text-[10px]">{item.rows} rows</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>{item.columns} columns</span>
                <Badge variant="secondary" className="text-[10px]">{item.datasetId.slice(0, 8)}</Badge>
              </div>
              {item.notes?.length ? (
                <ul className="space-y-1">
                  {item.notes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        );
      case 'feature_suggestion': {
        const state = suggestions.find((entry) => entry.item.id === item.id);
        const enabled = state?.enabled ?? false;
        return (
          <Card key={item.id} className={cn('border', enabled && 'border-foreground/40')}>
            <CardContent className="p-4 space-y-3">
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
                    enabled
                      ? 'border-foreground/50 bg-foreground/10 text-foreground'
                      : 'border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => handleToggleSuggestion(item.id, !enabled)}
                >
                  {enabled ? 'Enabled' : 'Enable'}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5">{item.feature.method}</span>
                <span className="rounded bg-muted px-2 py-0.5">{item.impact} impact</span>
              </div>
              {item.controls?.length ? (
                <div className="grid gap-3">
                  {item.controls.map((control) => (
                    <div key={control.key} className="space-y-1">
                      <Label className="text-xs">{control.label}</Label>
                      {control.type === 'boolean' ? (
                        <Switch
                          checked={Boolean(state?.params?.[control.key] ?? control.value ?? false)}
                          onCheckedChange={(checked) => handleControlChange(item.id, control.key, checked)}
                        />
                      ) : (control.type === 'select' || control.type === 'column') && (control.options || datasetColumns.length > 0) ? (
                        <Select
                          value={String(state?.params?.[control.key] ?? control.value ?? '')}
                          onValueChange={(value) => handleControlChange(item.id, control.key, value)}
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
                          value={String(state?.params?.[control.key] ?? control.value ?? '')}
                          onChange={(event) => {
                            const next = control.type === 'number'
                              ? event.target.valueAsNumber
                              : event.target.value;
                            handleControlChange(item.id, control.key, Number.isNaN(next as number) ? control.value : next);
                          }}
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          className="h-8 text-xs"
                        />
                      )}
                    </div>
                  ))}
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
              <pre className="text-xs rounded-md bg-muted p-3 overflow-x-auto">
                {item.content}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => navigator.clipboard.writeText(item.content)}
              >
                <Code className="h-4 w-4" />
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
              item.tone === 'warning' && 'border-amber-500/40 text-amber-600',
              item.tone === 'success' && 'border-emerald-500/40 text-emerald-600'
            )}
          >
            {item.text}
          </div>
        );
      case 'action':
        return (
          <Button key={item.id} size="sm" variant="outline">
            {item.label}
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full border rounded-lg overflow-hidden bg-card flex-col">
      {/* Approval Gate Banner */}
      <div className={cn("px-6 py-3 border-b flex items-center justify-between", 
        isApproved ? "bg-emerald-500/10 border-emerald-500/20" : "bg-muted/40"
      )}>
        <div className="flex items-center gap-3">
          {isApproved ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <Info className="h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <h3 className="font-semibold text-sm">
              {isApproved ? 'Pipeline Approved' : 'Approval Gate: Readiness Review'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isApproved 
                ? "This feature engineering pipeline is locked and ready for model training." 
                : "Review the unified readiness report below and explicitly approve before training can proceed."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isApproved ? (
             <Button variant="outline" size="sm" onClick={() => createDraftVersion(projectId, 'New Draft Pipeline')}>
               <Plus className="h-4 w-4 mr-2" /> Start New Draft
             </Button>
          ) : (
             <Button 
               size="sm" 
               className={cn("gap-2", isReadyForApproval ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "")}
               disabled={!isReadyForApproval}
                onClick={() => currentVersion && approveVersion(projectId, currentVersion.id)}
              >
                <CheckCircle2 className="h-4 w-4" /> Approve Pipeline
             </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left pane: Dataset & Controls */}
        <div className="w-[300px] border-r bg-muted/10 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              
              {/* Version Timeline */}
              <div className="space-y-3">
                <Label className="text-workflow-label uppercase tracking-wide flex items-center gap-2">
                  <History className="h-3 w-3" /> Versions
                </Label>
                <div className="space-y-2">
                  {versions.map(v => (
                    <div 
                      key={v.id}
                      onClick={() => setCurrentVersion(projectId, v.id)}
                      className={cn(
                        "text-xs p-2 rounded-md border cursor-pointer transition-colors flex items-center justify-between",
                        currentVersion?.id === v.id ? "bg-primary/10 border-primary/30" : "bg-card hover:bg-muted"
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{v.name}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</span>
                      </div>
                      <Badge variant={v.status === 'approved' ? 'default' : v.status === 'deprecated' ? 'secondary' : 'outline'} className="text-[9px]">
                        {v.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Data Settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-workflow-label uppercase tracking-wide">Dataset</Label>
                  <Select value={selectedDataset ?? ''} onValueChange={setSelectedDataset} disabled={datasetFiles.length === 0 || isApproved}>
                    <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Choose dataset..." /></SelectTrigger>
                    <SelectContent>
                      {datasetFiles.map((file) => <SelectItem key={file.id} value={file.id}>{file.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-workflow-label uppercase tracking-wide">Target</Label>
                  <Select value={targetColumn ?? ''} onValueChange={setTargetColumn} disabled={datasetColumns.length === 0 || isApproved}>
                    <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Select target column" /></SelectTrigger>
                    <SelectContent>
                      {datasetColumns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />
              
              {/* Generation Goal */}
              <div className="space-y-2">
                <Label className="text-workflow-label uppercase tracking-wide">Goal</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="What should the model learn? Any constraints?"
                  className="min-h-[100px] text-xs"
                  disabled={isApproved}
                />
              </div>

              <Button
                onClick={() => handleGenerate()}
                disabled={!selectedDatasetFile?.metadata?.datasetId || isGenerating || isApproved}
                className="w-full gap-2 text-xs h-8"
                variant="outline"
              >
                {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {isGenerating ? 'Generating...' : 'Generate Plan'}
              </Button>
              {isGenerating && (
                <Button variant="ghost" size="sm" onClick={handleStop} className="w-full h-8 text-xs">
                  Stop
                </Button>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-card">
          <Tabs defaultValue="notebook" className="flex-1 flex flex-col">
            <div className="border-b px-4 py-2 bg-muted/20">
              <TabsList className="h-8">
                <TabsTrigger value="notebook" className="text-xs h-6 px-3"><Beaker className="h-3 w-3 mr-2"/> Notebook</TabsTrigger>
                <TabsTrigger value="readiness" className="text-xs h-6 px-3 relative">
                  <FileText className="h-3 w-3 mr-2"/> Readiness Report
                  {isReadyForApproval && !isApproved && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* NOTEBOOK TAB */}
            <TabsContent value="notebook" className="flex-1 m-0 overflow-hidden outline-none data-[state=inactive]:hidden flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-6 max-w-4xl mx-auto space-y-6">
                  {/* Chat / Plan output */}
                  {cleanedAssistantText && (
                    <Card className="border-muted/40 shadow-sm">
                      <CardHeader className="pb-2 bg-muted/20">
                        <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary"/> AI Engineer Notes</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap pt-4">
                        {cleanedAssistantText}
                      </CardContent>
                    </Card>
                  )}

                  {assistantError && (
                    <Card className="border-destructive/40 bg-destructive/10">
                      <CardContent className="py-3 text-xs text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {assistantError}
                      </CardContent>
                    </Card>
                  )}

                  <ToolIndicator toolCalls={toolCalls} results={toolResults} isRunning={isRunningTools} />

                  {hasRenderableAssistantUi ? (
                    <div className="space-y-6">
                      {assistantUi?.sections.map((section) => (
                        <div key={section.id} className="space-y-3">
                          {section.title && <h3 className="text-sm font-semibold">{section.title}</h3>}
                          <div
                            className={cn(
                              section.layout === 'grid' && 'grid gap-3',
                              section.layout === 'grid' && section.columns === 2 && 'md:grid-cols-2',
                              section.layout === 'grid' && section.columns === 3 && 'md:grid-cols-3',
                              (!section.layout || section.layout === 'column') && 'space-y-3'
                            )}
                          >
                            {section.items.map(renderItem)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    !cleanedAssistantText && !assistantError && (
                      <div className="rounded-lg border border-dashed p-10 flex flex-col items-center justify-center text-center text-sm text-muted-foreground bg-muted/10">
                        <Beaker className="h-8 w-8 mb-3 opacity-20" />
                        <p className="font-medium text-foreground">No feature pipeline generated yet</p>
                        <p className="mt-1">Use the panel on the left to set a goal and generate a plan.</p>
                      </div>
                    )
                  )}
                </div>
              </ScrollArea>
              
              {/* Optional: Code Preview / Output block (moved to bottom) */}
              <div className="border-t bg-muted/10 p-4">
                <div className="max-w-4xl mx-auto flex items-end gap-4">
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs">Output Table Name (optional)</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={outputName} 
                        onChange={(e) => setOutputName(e.target.value)} 
                        placeholder="e.g. features_v1" 
                        className="h-8 text-xs bg-card" 
                        disabled={isApproved}
                      />
                      <Select value={outputFormat} onValueChange={(v) => setOutputFormat(v as 'csv' | 'json' | 'xlsx')} disabled={isApproved}>
                        <SelectTrigger className="w-[100px] h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="csv">CSV</SelectItem><SelectItem value="json">JSON</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    className="h-8 text-xs gap-2"
                    onClick={handleApplyFeatures}
                    disabled={applyStatus === 'loading' || isApproved || activeFeatures.length === 0}
                  >
                    {applyStatus === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Test Run Pipeline
                  </Button>
                </div>
                {applyMessage && (
                  <div className={cn('text-xs mt-2 max-w-4xl mx-auto', applyStatus === 'error' ? 'text-destructive' : 'text-emerald-600')}>
                    {applyMessage}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* READINESS REPORT TAB */}
            <TabsContent value="readiness" className="flex-1 m-0 overflow-hidden outline-none data-[state=inactive]:hidden flex flex-col bg-muted/5">
              <ScrollArea className="flex-1">
                <div className="p-6 max-w-3xl mx-auto space-y-8">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Unified Readiness Report</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Comprehensive view of pipeline transformations and resulting schema changes.
                    </p>
                  </div>

                    {/* Transformation Steps */}
                    <div className="space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <History className="h-4 w-4" /> Transformation Steps
                    </h3>
                    {readinessReport.steps.length === 0 ? (
                       <p className="text-sm text-muted-foreground italic border rounded-md p-4 bg-card">No transformations enabled.</p>
                     ) : (
                       <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                        {readinessReport.steps.map((step, i) => (
                          <div key={step.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-background bg-muted shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xs font-semibold">
                              {i + 1}
                            </div>
                            <Card className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] hover:shadow-md transition-shadow">
                              <CardContent className="p-4 space-y-2">
                                <div className="flex justify-between items-start">
                                  <h4 className="text-sm font-semibold">{step.name}</h4>
                                  <Badge variant="outline" className="text-[10px] bg-background">{step.method ?? 'custom'}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{step.rationale}</p>
                                {step.columns?.length ? (
                                  <div className="pt-2 flex flex-wrap gap-1">
                                    {step.columns.map((column) => (
                                      <span key={column} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                                        {column}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {step.codeReference ? (
                                  <p className="text-[10px] text-muted-foreground/80 font-mono">ref: {step.codeReference}</p>
                                ) : null}
                              </CardContent>
                            </Card>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Data Change Summary */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Data Change Summary
                    </h3>
                    <Card>
                      <CardContent className="p-0 divide-y text-sm">
                        <div className="grid grid-cols-3 divide-x">
                          <div className="p-4 space-y-1 bg-emerald-500/5">
                            <p className="text-xs font-medium text-emerald-700">Added Columns</p>
                            <p className="text-xl font-semibold text-emerald-700">{readinessReport.dataSummary.addedColumns.length}</p>
                            <p className="text-[10px] text-emerald-600/70 truncate">
                              {readinessReport.dataSummary.addedColumns.slice(0, 2).join(', ')}
                              {readinessReport.dataSummary.addedColumns.length > 2 && '...'}
                            </p>
                          </div>
                          <div className="p-4 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Removed/Renamed</p>
                            <p className="text-xl font-semibold">
                              {readinessReport.dataSummary.removedColumns.length + readinessReport.dataSummary.renamedColumns.length}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {readinessReport.dataSummary.removedColumns.length === 0 && readinessReport.dataSummary.renamedColumns.length === 0
                                ? 'No columns dropped or renamed'
                                : 'Columns removed/renamed detected'}
                            </p>
                          </div>
                          <div className="p-4 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Null/NaN Deltas</p>
                            <p className="text-xl font-semibold">{readinessReport.dataSummary.nullDeltas.length}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {readinessReport.dataSummary.nullDeltas.length > 0 ? 'Null changes captured' : 'No null-change data yet'}
                            </p>
                          </div>
                        </div>
                        
                        {/* Placeholder Warnings */}
                        <div className="p-4 bg-amber-500/5">
                          <p className="text-xs font-medium text-amber-700 flex items-center gap-1 mb-2">
                            <AlertTriangle className="h-3 w-3" /> Pre-Flight Checks
                          </p>
                          <ul className="text-xs text-amber-700 space-y-1 list-disc pl-4">
                            {readinessReport.dataSummary.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {codePreview && (
                    <div className="space-y-4">
                       <h3 className="text-sm font-semibold flex items-center gap-2">
                         <Code className="h-4 w-4" /> Code Reference
                       </h3>
                       <Card className="border-muted/40">
                         <CardContent className="p-0">
                           <pre className="text-xs bg-muted/50 p-4 overflow-x-auto text-muted-foreground border-b">
                             {codePreview}
                           </pre>
                         </CardContent>
                       </Card>
                    </div>
                  )}

                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

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
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { applyFeatureEngineering } from '@/lib/api/featureEngineering';
import { executeToolCalls, streamFeaturePlan } from '@/lib/api/llm';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import type { FeatureSpec, FeatureMethod, FeatureCategory } from '@/types/feature';
import { FEATURE_TEMPLATES } from '@/types/feature';
import type { ToolCall, ToolResult, UiItem, UiSchema } from '@/types/llmUi';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { cn } from '@/lib/utils';
import { Loader2, Play, Sparkles, Code, AlertTriangle } from 'lucide-react';

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

export function FeatureEngineeringPanel({ projectId }: FeatureEngineeringPanelProps) {
  const allFiles = useDataStore((state) => state.files);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

  const features = useFeatureStore((state) => state.features);
  const upsertFeature = useFeatureStore((state) => state.upsertFeature);
  const removeFeature = useFeatureStore((state) => state.removeFeature);
  const hydrateFeatures = useFeatureStore((state) => state.hydrateFromProject);

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

  useEffect(() => {
    hydrateFromBackend(projectId);
    hydrateFeatures(projectId);
  }, [projectId, hydrateFromBackend, hydrateFeatures]);

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
            if (event.envelope.tool_calls?.length) {
              setToolCalls(event.envelope.tool_calls);
              toolHistoryRef.current.calls = mergeToolCalls(
                toolHistoryRef.current.calls,
                event.envelope.tool_calls
              );
              setAssistantUi(null);
            } else {
              setAssistantUi(event.envelope.ui ?? null);
              setToolCalls([]);
            }
            if (event.envelope.message) {
              setAssistantText((prev) => (prev.trim() ? prev : event.envelope.message ?? ''));
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
  }, [projectId, selectedDatasetFile, targetColumn, prompt]);

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

  const resetToolHistory = useCallback(() => {
    toolHistoryRef.current = { calls: [], results: [] };
    setToolCalls([]);
    setToolResults([]);
    toolAttemptRef.current = 0;
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
    <div className="flex h-full border rounded-lg overflow-hidden bg-card">
      <div className="w-[320px] border-r bg-muted/20 flex flex-col">
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-workflow-label uppercase tracking-wide">Dataset</Label>
            <Select
              value={selectedDataset ?? ''}
              onValueChange={(value) => setSelectedDataset(value)}
              disabled={datasetFiles.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose dataset..." />
              </SelectTrigger>
              <SelectContent>
                {datasetFiles.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    {file.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {datasetFiles.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Upload a dataset to start planning features.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-workflow-label uppercase tracking-wide">Target</Label>
            <Select
              value={targetColumn ?? ''}
              onValueChange={(value) => setTargetColumn(value)}
              disabled={datasetColumns.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select target column" />
              </SelectTrigger>
              <SelectContent>
                {datasetColumns.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-workflow-label uppercase tracking-wide">Goal</Label>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What should the model learn? Any constraints?"
              className="min-h-[120px] text-xs"
            />
          </div>

          <Button
            onClick={() => handleGenerate()}
            disabled={!selectedDatasetFile?.metadata?.datasetId || isGenerating}
            className="w-full gap-2"
            variant="outline"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isGenerating ? 'Generating plan...' : 'Generate AI plan'}
          </Button>
          {isGenerating && (
            <Button variant="ghost" size="sm" onClick={handleStop} className="w-full">
              Stop generation
            </Button>
          )}

          <Separator />

          <div className="space-y-2">
            <Label className="text-workflow-label uppercase tracking-wide">Output</Label>
            <Input
              value={outputName}
              onChange={(event) => setOutputName(event.target.value)}
              placeholder="Optional output filename"
              className="text-xs"
            />
            <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as typeof outputFormat)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Output format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="xlsx">Excel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2 border-foreground/40 bg-foreground/10 text-foreground hover:bg-foreground/15"
            onClick={handleApplyFeatures}
            disabled={applyStatus === 'loading'}
          >
            {applyStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Apply features
          </Button>
          {applyMessage && (
            <div className={cn('text-xs', applyStatus === 'error' && 'text-destructive', applyStatus === 'success' && 'text-emerald-600')}>
              {applyMessage}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-4">
            {cleanedAssistantText && (
              <Card className="border-muted/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">AI Notes</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
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

            <ToolIndicator
              toolCalls={toolCalls}
              results={toolResults}
              isRunning={isRunningTools}
            />

            {assistantUi ? (
              <div className="space-y-4">
                {assistantUi.sections.map((section) => (
                  <div key={section.id} className="space-y-3">
                    {section.title && <p className="text-sm font-semibold">{section.title}</p>}
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
              !cleanedAssistantText && (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  Generate an AI plan to see feature ideas and controls.
                </div>
              )
            )}

            {codePreview && (
              <Card className="border-muted/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Code preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs rounded-md bg-muted p-3 overflow-x-auto">
                    {codePreview}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

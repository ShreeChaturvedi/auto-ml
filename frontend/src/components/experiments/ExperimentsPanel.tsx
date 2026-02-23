import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Download, Loader2, RefreshCcw, Rocket, Sparkles } from 'lucide-react';

import { useDataStore } from '@/stores/dataStore';
import { useModelStore } from '@/stores/modelStore';
import { getModelArtifactUrl } from '@/lib/api/models';
import type { ModelTemplate, TrainModelRequest } from '@/types/model';
import { cn } from '@/lib/utils';

const formatMetric = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  return value >= 1 ? value.toFixed(2) : value.toFixed(4);
};

export function ExperimentsPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);
  const files = useDataStore((state) => state.files);

  const {
    templates,
    models,
    isLoadingModels,
    isLoadingTemplates,
    isTraining,
    error,
    fetchTemplates,
    refreshModels,
    trainModel
  } = useModelStore();

  const datasetFiles = useMemo(
    () => files.filter((file) => file.projectId === projectId && file.metadata?.datasetId),
    [files, projectId]
  );

  const datasetOptions = useMemo(
    () =>
      datasetFiles.map((file) => ({
        id: file.metadata?.datasetId ?? file.id,
        name: file.name,
        columns: file.metadata?.columns ?? [],
        rowCount: file.metadata?.rowCount,
        columnCount: file.metadata?.columnCount
      })),
    [datasetFiles]
  );

  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [targetColumn, setTargetColumn] = useState<string>('');
  const [testSize, setTestSize] = useState(0.2);
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});
  const [trainMessage, setTrainMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    void hydrateFromBackend(projectId);
  }, [projectId, hydrateFromBackend]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (!projectId) return;
    void refreshModels(projectId);
  }, [projectId, refreshModels]);

  useEffect(() => {
    if (!selectedDatasetId && datasetOptions.length > 0) {
      setSelectedDatasetId(datasetOptions[0].id);
    }
  }, [datasetOptions, selectedDatasetId]);

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  const selectedTemplate = useMemo<ModelTemplate | undefined>(
    () => templates.find((template) => template.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  const selectedDataset = useMemo(
    () => datasetOptions.find((dataset) => dataset.id === selectedDatasetId),
    [datasetOptions, selectedDatasetId]
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setParamValues({});
      return;
    }

    const defaults = selectedTemplate.parameters.reduce<Record<string, unknown>>((acc, param) => {
      acc[param.key] = param.default;
      return acc;
    }, {});
    setParamValues(defaults);
  }, [selectedTemplate]);

  useEffect(() => {
    if (selectedTemplate?.taskType === 'clustering') {
      setTargetColumn('');
      return;
    }
    if (selectedDataset && selectedDataset.columns.length > 0 && !targetColumn) {
      setTargetColumn(selectedDataset.columns[0]);
    }
  }, [selectedDataset, selectedTemplate, targetColumn]);

  const handleTrain = async () => {
    if (!projectId || !selectedDatasetId || !selectedTemplate) return;
    setTrainMessage(null);

    const normalizedTestSize = Number.isFinite(testSize) ? testSize : 0.2;

    const request: TrainModelRequest = {
      projectId,
      datasetId: selectedDatasetId,
      templateId: selectedTemplate.id,
      targetColumn: selectedTemplate.taskType === 'clustering' ? undefined : targetColumn,
      parameters: paramValues,
      testSize: normalizedTestSize
    };

    const result = await trainModel(request);
    if (result) {
      setTrainMessage(result.status === 'completed' ? 'Training complete.' : 'Training failed.');
    }
  };

  const datasetLookup = useMemo(() => {
    const map = new Map<string, string>();
    datasetOptions.forEach((dataset) => map.set(dataset.id, dataset.name));
    return map;
  }, [datasetOptions]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Experiments</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">— Train models and track metrics</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => projectId && refreshModels(projectId)}
          title="Refresh experiments"
          className="hover:bg-foreground/10"
        >
          {isLoadingModels ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="grid h-full gap-4 p-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card className="h-full overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">New Training Run</CardTitle>
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-4 overflow-hidden">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Dataset</Label>
                <Select
                  value={selectedDatasetId ?? ''}
                  onValueChange={(value) => setSelectedDatasetId(value)}
                  disabled={datasetOptions.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasetOptions.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedDataset && (
                  <p className="text-xs text-muted-foreground">
                    {selectedDataset.rowCount ?? '—'} rows · {selectedDataset.columnCount ?? selectedDataset.columns.length} columns
                  </p>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Model template</Label>
                <Select
                  value={selectedTemplateId ?? ''}
                  onValueChange={(value) => setSelectedTemplateId(value)}
                  disabled={isLoadingTemplates}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
                )}
              </div>

              {selectedTemplate?.taskType !== 'clustering' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Target column</Label>
                  <Select
                    value={targetColumn}
                    onValueChange={setTargetColumn}
                    disabled={!selectedDataset || selectedDataset.columns.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select target" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedDataset?.columns.map((column) => (
                        <SelectItem key={column} value={column}>
                          {column}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedTemplate?.parameters.length ? (
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Parameters</Label>
                  {selectedTemplate.parameters.map((param) => {
                    const value = paramValues[param.key];
                    if (param.type === 'boolean') {
                      return (
                        <div key={param.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <span className="text-xs">{param.label}</span>
                          <Switch
                            checked={Boolean(value)}
                            onCheckedChange={(checked) =>
                              setParamValues((prev) => ({ ...prev, [param.key]: checked }))
                            }
                          />
                        </div>
                      );
                    }

                    if (param.type === 'select' && param.options) {
                      return (
                        <div key={param.key} className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">{param.label}</Label>
                          <Select
                            value={String(value ?? param.default)}
                            onValueChange={(newValue) =>
                              setParamValues((prev) => ({ ...prev, [param.key]: newValue }))
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder={param.label} />
                            </SelectTrigger>
                            <SelectContent>
                              {param.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    }

                    return (
                      <div key={param.key} className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{param.label}</Label>
                        <Input
                          type={param.type === 'number' ? 'number' : 'text'}
                          value={value === undefined ? '' : String(value)}
                          min={param.min}
                          max={param.max}
                          step={param.step ?? (param.type === 'number' ? '1' : undefined)}
                          onChange={(event) =>
                            setParamValues((prev) => ({
                              ...prev,
                              [param.key]: param.type === 'number'
                                ? (event.target.value === '' ? undefined : Number(event.target.value))
                                : event.target.value
                            }))
                          }
                          className="h-8"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Test split</Label>
                <Input
                  type="number"
                  value={testSize}
                  min={0.1}
                  max={0.4}
                  step={0.05}
                  onChange={(event) => setTestSize(Number(event.target.value))}
                  className="h-8"
                />
              </div>

              <div className="mt-auto space-y-2">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleTrain}
                  disabled={
                    !projectId ||
                    !selectedDatasetId ||
                    !selectedTemplateId ||
                    (selectedTemplate?.taskType !== 'clustering' && !targetColumn) ||
                    isTraining
                  }
                >
                  {isTraining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Train model
                </Button>
                {trainMessage && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Rocket className="h-3 w-3" />
                    {trainMessage}
                  </div>
                )}
                {error && (
                  <p className="text-xs text-destructive">{error}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="h-full overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Model Registry</CardTitle>
            </CardHeader>
            <CardContent className="h-full overflow-hidden">
              <ScrollArea className="h-full pr-3">
                {models.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                    No experiments yet. Train a model to see results.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {models.map((model) => (
                      <div
                        key={model.modelId}
                        className="rounded-lg border border-border/60 bg-muted/20 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{model.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {model.algorithm} · {model.taskType}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              model.status === 'completed'
                                ? 'border-emerald-500/40 text-emerald-600'
                                : 'border-destructive/40 text-destructive'
                            )}
                          >
                            {model.status}
                          </Badge>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(model.metrics).length === 0 ? (
                            <span className="text-xs text-muted-foreground">No metrics</span>
                          ) : (
                            Object.entries(model.metrics).map(([key, value]) => (
                              <Badge key={key} variant="secondary" className="text-[10px]">
                                {key}: {formatMetric(value)}
                              </Badge>
                            ))
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span>Dataset: {datasetLookup.get(model.datasetId) ?? model.datasetId}</span>
                          {model.trainingMs && <span>• {model.trainingMs}ms</span>}
                          {model.sampleCount && <span>• {model.sampleCount} rows</span>}
                        </div>

                        {model.error && (
                          <p className="mt-2 text-xs text-destructive">{model.error}</p>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          {model.artifact?.path && (
                            <Button variant="ghost" size="icon-sm" asChild>
                              <a href={getModelArtifactUrl(model.modelId)} title="Download model">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {model.featureColumns && (
                            <span className="text-[11px] text-muted-foreground">
                              {model.featureColumns.length} features
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

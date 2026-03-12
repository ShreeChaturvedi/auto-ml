import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCcw, Sparkles } from 'lucide-react';

import { useDataStore } from '@/stores/dataStore';
import { useModelStore } from '@/stores/modelStore';
import type { ModelTemplate, TrainModelRequest } from '@/types/model';
import { ExperimentCard } from './ExperimentCard';
import { TrainingForm } from './TrainingForm';

export function ExperimentsPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);
  const files = useDataStore((state) => state.files);

  const templates = useModelStore((state) => state.templates);
  const models = useModelStore((state) => state.models);
  const isLoadingModels = useModelStore((state) => state.isLoadingModels);
  const isLoadingTemplates = useModelStore((state) => state.isLoadingTemplates);
  const isTraining = useModelStore((state) => state.isTraining);
  const error = useModelStore((state) => state.error);
  const fetchTemplates = useModelStore((state) => state.fetchTemplates);
  const refreshModels = useModelStore((state) => state.refreshModels);
  const trainModel = useModelStore((state) => state.trainModel);

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
          <TrainingForm
            datasetOptions={datasetOptions}
            selectedDatasetId={selectedDatasetId}
            onDatasetChange={(value) => setSelectedDatasetId(value)}
            selectedDataset={selectedDataset}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onTemplateChange={(value) => setSelectedTemplateId(value)}
            isLoadingTemplates={isLoadingTemplates}
            selectedTemplate={selectedTemplate}
            targetColumn={targetColumn}
            onTargetColumnChange={setTargetColumn}
            testSize={testSize}
            onTestSizeChange={setTestSize}
            paramValues={paramValues}
            onParamChange={(key, value) =>
              setParamValues((prev) => ({ ...prev, [key]: value }))
            }
            isTraining={isTraining}
            trainMessage={trainMessage}
            error={error}
            onTrain={handleTrain}
            canTrain={
              !!projectId &&
              !!selectedDatasetId &&
              !!selectedTemplateId &&
              (selectedTemplate?.taskType === 'clustering' || !!targetColumn) &&
              !isTraining
            }
          />

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
                      <ExperimentCard
                        key={model.modelId}
                        model={model}
                        datasetName={datasetLookup.get(model.datasetId)}
                      />
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

/**
 * TrainingForm - The left-side card for configuring and launching a training run.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Loader2, Rocket, Sparkles } from 'lucide-react';

import type { ModelTemplate } from '@/types/model';

export interface DatasetOption {
  id: string;
  name: string;
  columns: string[];
  rowCount?: number;
  columnCount?: number;
}

export interface TrainingFormProps {
  datasetOptions: DatasetOption[];
  selectedDatasetId: string | null;
  onDatasetChange: (id: string) => void;
  selectedDataset: DatasetOption | undefined;
  templates: ModelTemplate[];
  selectedTemplateId: string | null;
  onTemplateChange: (id: string) => void;
  isLoadingTemplates: boolean;
  selectedTemplate: ModelTemplate | undefined;
  targetColumn: string;
  onTargetColumnChange: (col: string) => void;
  testSize: number;
  onTestSizeChange: (size: number) => void;
  paramValues: Record<string, unknown>;
  onParamChange: (key: string, value: unknown) => void;
  isTraining: boolean;
  trainMessage: string | null;
  error: string | null;
  onTrain: () => void;
  canTrain: boolean;
}

export function TrainingForm({
  datasetOptions,
  selectedDatasetId,
  onDatasetChange,
  selectedDataset,
  templates,
  selectedTemplateId,
  onTemplateChange,
  isLoadingTemplates,
  selectedTemplate,
  targetColumn,
  onTargetColumnChange,
  testSize,
  onTestSizeChange,
  paramValues,
  onParamChange,
  isTraining,
  trainMessage,
  error,
  onTrain,
  canTrain,
}: TrainingFormProps) {
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Training Run</CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4 overflow-hidden">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Dataset</Label>
          <Select
            value={selectedDatasetId ?? ''}
            onValueChange={onDatasetChange}
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
            onValueChange={onTemplateChange}
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
              onValueChange={onTargetColumnChange}
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
                      onCheckedChange={(checked) => onParamChange(param.key, checked)}
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
                      onValueChange={(newValue) => onParamChange(param.key, newValue)}
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
                      onParamChange(
                        param.key,
                        param.type === 'number'
                          ? (event.target.value === '' ? undefined : Number(event.target.value))
                          : event.target.value
                      )
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
            onChange={(event) => onTestSizeChange(Number(event.target.value))}
            className="h-8"
          />
        </div>

        <div className="mt-auto space-y-2">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={onTrain}
            disabled={!canTrain}
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
  );
}

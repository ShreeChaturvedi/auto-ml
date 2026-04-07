import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ReadinessReport } from '@/types/feature';
import { ChevronDown, ChevronUp, FileOutput, Loader2 } from 'lucide-react';

interface FeatureEngineeringFooterProps {
  readinessReportUnlocked: boolean;
  isReadinessExpanded: boolean;
  onToggleReadiness: () => void;
  readinessReport: ReadinessReport;
  outputName: string;
  onOutputNameChange: (value: string) => void;
  outputFormat: 'csv' | 'json' | 'xlsx';
  onOutputFormatChange: (value: 'csv' | 'json' | 'xlsx') => void;
  onApplyFeatures: () => void;
  applyStatus: 'idle' | 'loading' | 'success' | 'error';
  applyMessage: string | null;
  activeFeaturesCount: number;
}

export function FeatureEngineeringFooter({
  readinessReportUnlocked,
  isReadinessExpanded,
  onToggleReadiness,
  readinessReport,
  outputName,
  onOutputNameChange,
  outputFormat,
  onOutputFormatChange,
  onApplyFeatures,
  applyStatus,
  applyMessage,
  activeFeaturesCount
}: FeatureEngineeringFooterProps) {
  return (
    <div className="space-y-3 border-t bg-background py-4">
      <div className="flex items-center justify-between gap-3 rounded border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Unified Readiness Report</p>
          <p className="text-xs text-muted-foreground">
            {readinessReportUnlocked
              ? 'Review enabled transformations and quality checks before applying the derived dataset.'
              : 'Enable at least one feature to unlock the readiness report.'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          onClick={onToggleReadiness}
          disabled={!readinessReportUnlocked}
        >
          {isReadinessExpanded ? (
            <>
              <ChevronUp className="mr-1 h-3.5 w-3.5" />
              Hide Report
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-3.5 w-3.5" />
              Show Report
            </>
          )}
        </Button>
      </div>

      {readinessReportUnlocked && isReadinessExpanded ? (
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
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {readinessReport.steps.map((step, index) => (
                  <div key={step.id} className="rounded border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{index + 1}. {step.name}</p>
                      <span className="rounded border px-1.5 py-0.5 text-[10px]">
                        {step.method ?? 'custom'}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{step.rationale}</p>
                    {step.columns?.length ? (
                      <p className="mt-1 text-muted-foreground">Columns: {step.columns.join(', ')}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed p-3 text-muted-foreground">
                No transformations enabled yet.
              </p>
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
          </CardContent>
        </Card>
      ) : null}

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
                onChange={(event) => onOutputNameChange(event.currentTarget.value)}
                placeholder="e.g. features_v1"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Format</Label>
              <Select value={outputFormat} onValueChange={onOutputFormatChange}>
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
              onClick={onApplyFeatures}
              disabled={applyStatus === 'loading' || activeFeaturesCount === 0}
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
}

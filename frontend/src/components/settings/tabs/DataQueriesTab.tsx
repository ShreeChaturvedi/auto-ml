import { useEffect, useState, useSyncExternalStore } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Database, Table2, BarChart3, Download, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { SaveButton, type ButtonState } from '@/components/settings/SaveButton';
import { fetchSettings, patchSettings } from '@/lib/api/settings';
import {
  getNullDisplayPref, setNullDisplayPref, subscribeNullDisplayPref,
  getDecimalPrecisionPref, setDecimalPrecisionPref, subscribeDecimalPrecisionPref,
  getPageSizePref, setPageSizePref, subscribePageSizePref,
  getDefaultChartPref, setDefaultChartPref, subscribeDefaultChartPref,
  getDefaultCorrelationPref, setDefaultCorrelationPref, subscribeDefaultCorrelationPref,
  getExportFormatPref, setExportFormatPref, subscribeExportFormatPref,
} from '@/lib/dataPrefs';

const querySettingsSchema = z.object({
  queryCacheTtlMs: z.number().int().min(0).max(3_600_000),
  sqlMaxRows: z.number().int().min(10).max(10_000),
  sqlDefaultLimit: z.number().int().min(10).max(1_000),
});
type QuerySettingsForm = z.infer<typeof querySettingsSchema>;

export function DataQueriesTab() {
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saveState, setSaveState] = useState<ButtonState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const form = useForm<QuerySettingsForm>({
    resolver: zodResolver(querySettingsSchema),
    defaultValues: { queryCacheTtlMs: 0, sqlMaxRows: 1000, sqlDefaultLimit: 100 },
  });

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        form.reset({
          queryCacheTtlMs: s.queryCacheTtlMs,
          sqlMaxRows: s.sqlMaxRows,
          sqlDefaultLimit: s.sqlDefaultLimit,
        });
      })
      .finally(() => setLoadingSettings(false));
  }, [form]);

  const nullDisplay = useSyncExternalStore(subscribeNullDisplayPref, getNullDisplayPref);
  const decimalPrecision = useSyncExternalStore(subscribeDecimalPrecisionPref, getDecimalPrecisionPref);
  const pageSize = useSyncExternalStore(subscribePageSizePref, getPageSizePref);
  const defaultChart = useSyncExternalStore(subscribeDefaultChartPref, getDefaultChartPref);
  const defaultCorrelation = useSyncExternalStore(subscribeDefaultCorrelationPref, getDefaultCorrelationPref);
  const exportFormat = useSyncExternalStore(subscribeExportFormatPref, getExportFormatPref);

  const onSubmit = async (data: QuerySettingsForm) => {
    setSaveState('loading');
    setSaveError(null);
    try {
      await patchSettings(data);
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.');
      setSaveState('error');
    }
  };

  const { errors } = form.formState;

  return (
    <div className="space-y-8">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {loadingSettings ? (
          <div className="rounded-lg border border-border bg-card/50 flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SettingsSection icon={Database} title="Query Limits">
            <SettingsRow
              label="Query cache TTL"
              description="Duration to cache query results. Set to 0 to disable caching."
            >
              <Input
                type="number"
                className="w-[120px] bg-transparent"
                {...form.register('queryCacheTtlMs', { valueAsNumber: true })}
              />
            </SettingsRow>

            <SettingsRow
              label="SQL max rows"
              description="Maximum number of rows returned by any query"
            >
              <Input
                type="number"
                className="w-[120px] bg-transparent"
                {...form.register('sqlMaxRows', { valueAsNumber: true })}
              />
            </SettingsRow>

            <SettingsRow
              label="SQL default LIMIT"
              description="LIMIT clause applied to SELECT queries when none is specified"
            >
              <Input
                type="number"
                className="w-[120px] bg-transparent"
                {...form.register('sqlDefaultLimit', { valueAsNumber: true })}
              />
            </SettingsRow>
          </SettingsSection>
        )}

        {(errors.queryCacheTtlMs || errors.sqlMaxRows || errors.sqlDefaultLimit) && (
          <div className="mt-2 space-y-1">
            {errors.queryCacheTtlMs && (
              <p className="text-xs text-destructive">{errors.queryCacheTtlMs.message}</p>
            )}
            {errors.sqlMaxRows && (
              <p className="text-xs text-destructive">{errors.sqlMaxRows.message}</p>
            )}
            {errors.sqlDefaultLimit && (
              <p className="text-xs text-destructive">{errors.sqlDefaultLimit.message}</p>
            )}
          </div>
        )}

        {saveError && (
          <p className="mt-2 text-xs text-destructive">{saveError}</p>
        )}

        <div className="mt-4">
          <SaveButton
            state={loadingSettings ? 'loading' : saveState}
            idleText="Save Query Settings"
            loadingText="Saving…"
          />
        </div>
      </form>

      <SettingsSection icon={Table2} title="Display">
        <SettingsRow
          label="Null display"
          description="How null values are rendered in data tables"
        >
          <Select value={nullDisplay} onValueChange={(v) => setNullDisplayPref(v as typeof nullDisplay)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="empty">Empty</SelectItem>
              <SelectItem value="NULL">NULL</SelectItem>
              <SelectItem value="N/A">N/A</SelectItem>
              <SelectItem value="—">—</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Decimal precision"
          description="Number of decimal places shown for floating-point values"
        >
          <Select
            value={String(decimalPrecision)}
            onValueChange={(v) => setDecimalPrecisionPref(Number(v))}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 6].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Dataset page size"
          description="Number of rows displayed per page in dataset views"
        >
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSizePref(Number(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[100, 200, 500].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection icon={BarChart3} title="Visualization">
        <SettingsRow
          label="Default distribution chart"
          description="Chart type used by default when visualizing column distributions"
        >
          <Select value={defaultChart} onValueChange={(v) => setDefaultChartPref(v as typeof defaultChart)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="histogram">Histogram</SelectItem>
              <SelectItem value="box">Box Plot</SelectItem>
              <SelectItem value="violin">Violin Plot</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          label="Default correlation view"
          description="Visualization used when exploring feature correlations"
        >
          <Select value={defaultCorrelation} onValueChange={(v) => setDefaultCorrelationPref(v as typeof defaultCorrelation)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="heatmap">Heatmap</SelectItem>
              <SelectItem value="pairplot">Pair Plot</SelectItem>
              <SelectItem value="scatter3d">3D Scatter</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection icon={Download} title="Export">
        <SettingsRow
          label="Default export format"
          description="File format used when exporting datasets or query results"
        >
          <Select value={exportFormat} onValueChange={(v) => setExportFormatPref(v as typeof exportFormat)}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="xlsx">XLSX</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

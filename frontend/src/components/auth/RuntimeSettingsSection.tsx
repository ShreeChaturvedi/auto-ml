import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Database, Play, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SaveButton, type ButtonState } from './ProfileSettings';
import { fetchSettings, patchSettings, type RuntimeSettings } from '@/lib/api/settings';

const querySettingsSchema = z.object({
  queryCacheTtlMs: z.number().int().min(0).max(3_600_000),
  sqlMaxRows: z.number().int().min(10).max(10_000),
  sqlDefaultLimit: z.number().int().min(10).max(1_000),
});

const executionSettingsSchema = z.object({
  executionTimeoutMs: z.number().int().min(5_000).max(120_000),
  executionMaxMemoryMb: z.number().int().min(256).max(4_096),
});

type QueryValues = z.infer<typeof querySettingsSchema>;
type ExecutionValues = z.infer<typeof executionSettingsSchema>;

export function RuntimeSettingsSection() {
  const [loading, setLoading] = useState(true);
  const [queryState, setQueryState] = useState<ButtonState>('idle');
  const [execState, setExecState] = useState<ButtonState>('idle');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const queryForm = useForm<QueryValues>({ resolver: zodResolver(querySettingsSchema) });
  const execForm = useForm<ExecutionValues>({ resolver: zodResolver(executionSettingsSchema) });

  useEffect(() => {
    fetchSettings()
      .then((s: RuntimeSettings) => {
        queryForm.reset({
          queryCacheTtlMs: s.queryCacheTtlMs,
          sqlMaxRows: s.sqlMaxRows,
          sqlDefaultLimit: s.sqlDefaultLimit,
        });
        execForm.reset({
          executionTimeoutMs: s.executionTimeoutMs,
          executionMaxMemoryMb: s.executionMaxMemoryMb,
        });
      })
      .catch(() => { /* defaults already in form */ })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onQuerySubmit = async (data: QueryValues) => {
    setQueryError(null);
    setQueryState('loading');
    try {
      await patchSettings(data);
      setQueryState('success');
      setTimeout(() => setQueryState('idle'), 2000);
    } catch {
      setQueryState('error');
      setQueryError('Failed to save query settings.');
    }
  };

  const onExecSubmit = async (data: ExecutionValues) => {
    setExecError(null);
    setExecState('loading');
    try {
      await patchSettings(data);
      setExecState('success');
      setTimeout(() => setExecState('idle'), 2000);
    } catch {
      setExecState('error');
      setExecError('Failed to save execution settings.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading settings...</span>
      </div>
    );
  }

  return (
    <>
      {/* Query Settings */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Query Settings
          </h2>
        </div>
        <form onSubmit={queryForm.handleSubmit(onQuerySubmit)}>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="queryCacheTtlMs" className="text-sm font-medium">Cache TTL (ms)</Label>
              <Input id="queryCacheTtlMs" type="number" className="bg-transparent dark:bg-white/[0.03] hover:border-ring focus-visible:ring-ring"
                {...queryForm.register('queryCacheTtlMs', { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">0 – 3,600,000</p>
              {queryForm.formState.errors.queryCacheTtlMs && (
                <p className="text-xs text-destructive">{queryForm.formState.errors.queryCacheTtlMs.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sqlMaxRows" className="text-sm font-medium">SQL Max Rows</Label>
              <Input id="sqlMaxRows" type="number" className="bg-transparent dark:bg-white/[0.03] hover:border-ring focus-visible:ring-ring"
                {...queryForm.register('sqlMaxRows', { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">10 – 10,000</p>
              {queryForm.formState.errors.sqlMaxRows && (
                <p className="text-xs text-destructive">{queryForm.formState.errors.sqlMaxRows.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sqlDefaultLimit" className="text-sm font-medium">SQL Default Limit</Label>
              <Input id="sqlDefaultLimit" type="number" className="bg-transparent dark:bg-white/[0.03] hover:border-ring focus-visible:ring-ring"
                {...queryForm.register('sqlDefaultLimit', { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">10 – 1,000</p>
              {queryForm.formState.errors.sqlDefaultLimit && (
                <p className="text-xs text-destructive">{queryForm.formState.errors.sqlDefaultLimit.message}</p>
              )}
            </div>
          </div>
          {queryError && <p className="mt-4 text-sm text-destructive">{queryError}</p>}
          <div className="mt-6">
            <SaveButton state={queryState} idleText="Save Query Settings" loadingText="Saving..." />
          </div>
        </form>
      </section>

      {/* Execution Settings */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2">
          <Play className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Execution Settings
          </h2>
        </div>
        <form onSubmit={execForm.handleSubmit(onExecSubmit)}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="executionTimeoutMs" className="text-sm font-medium">Execution Timeout (ms)</Label>
              <Input id="executionTimeoutMs" type="number" className="bg-transparent dark:bg-white/[0.03] hover:border-ring focus-visible:ring-ring"
                {...execForm.register('executionTimeoutMs', { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">5,000 – 120,000</p>
              {execForm.formState.errors.executionTimeoutMs && (
                <p className="text-xs text-destructive">{execForm.formState.errors.executionTimeoutMs.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="executionMaxMemoryMb" className="text-sm font-medium">Max Memory (MB)</Label>
              <Input id="executionMaxMemoryMb" type="number" className="bg-transparent dark:bg-white/[0.03] hover:border-ring focus-visible:ring-ring"
                {...execForm.register('executionMaxMemoryMb', { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">256 – 4,096</p>
              {execForm.formState.errors.executionMaxMemoryMb && (
                <p className="text-xs text-destructive">{execForm.formState.errors.executionMaxMemoryMb.message}</p>
              )}
            </div>
          </div>
          {execError && <p className="mt-4 text-sm text-destructive">{execError}</p>}
          <div className="mt-6">
            <SaveButton state={execState} idleText="Save Execution Settings" loadingText="Saving..." />
          </div>
        </form>
      </section>
    </>
  );
}

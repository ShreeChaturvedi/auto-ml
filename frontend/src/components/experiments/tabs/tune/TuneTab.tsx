import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { startTuning as startTuningApi } from '@/lib/api/experiments';
import { readNdjsonStream } from '@/lib/api/streamReader';
import { cn } from '@/lib/utils';
import { PRIMARY_METRIC } from '@/components/experiments/utils';
import type { TuningTrialEvent, TuningStreamEvent } from '@/types/experiments';
import type { ModelTaskType } from '@/types/model';
import { IntentPhase } from './phases/IntentPhase';
import { DiscoveryPhase } from './phases/DiscoveryPhase';
import { InsightPhase } from './phases/InsightPhase';

const BUDGET_PRESETS = {
  quick: { trials: 20, timeout: 120, label: 'Quick', description: '~2 min' },
  balanced: { trials: 50, timeout: 300, label: 'Balanced', description: '~5 min' },
  deep: { trials: 100, timeout: 600, label: 'Deep', description: '~15 min' },
  maximum: { trials: 200, timeout: 1800, label: 'Maximum', description: '~30 min' },
} as const;

type Phase = 'intent' | 'discovery' | 'insight' | 'error';
type BudgetKey = keyof typeof BUDGET_PRESETS;

const MINIMIZE_METRICS = new Set(['rmse', 'mae', 'mse']);

export interface TuneTabProps { modelId: string }

export function TuneTab({ modelId }: TuneTabProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const model = useModelStore((s) => s.models.find((m) => m.modelId === modelId));
  const template = useModelStore((s) => s.templates.find((t) => t.id === model?.templateId));
  const refreshModels = useModelStore((s) => s.refreshModels);
  const selectModel = useExperimentsStore((s) => s.selectModel);

  // Phase
  const [phase, setPhase] = useState<Phase>('intent');
  const [isExiting, setIsExiting] = useState(false);

  // Config
  const [metric, setMetric] = useState('');
  const [budget, setBudget] = useState<BudgetKey>('balanced');
  const [nTrials, setNTrials] = useState<number>(BUDGET_PRESETS.balanced.trials);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(BUDGET_PRESETS.balanced.timeout);
  const [sampler, setSampler] = useState<'tpe' | 'random'>('tpe');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Session
  const [trials, setTrials] = useState<TuningTrialEvent[]>([]);
  const [bestValue, setBestValue] = useState<number | null>(null);
  const [prevBestValue, setPrevBestValue] = useState<number | null>(null);
  const [bestParams, setBestParams] = useState<Record<string, unknown> | null>(null);
  const [resultModelId, setResultModelId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [importances, setImportances] = useState<Record<string, number> | null>(null);
  const [convergenceStatus, setConvergenceStatus] = useState<'exploring' | 'narrowing' | 'converging' | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Auto-select metric on mount
  const taskType = (model?.taskType ?? 'classification') as ModelTaskType;
  useEffect(() => {
    if (!metric) setMetric(PRIMARY_METRIC[taskType] ?? 'accuracy');
  }, [metric, taskType]);

  // Sync budget preset to trials/timeout
  useEffect(() => {
    const preset = BUDGET_PRESETS[budget];
    setNTrials(preset.trials as number);
    setTimeoutSeconds(preset.timeout as number);
  }, [budget]);

  // Cleanup abort on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Derived values
  const nComplete = trials.length > 0 ? trials[trials.length - 1].n_complete : 0;
  const nTotal = trials.length > 0 ? trials[trials.length - 1].n_total : nTrials;
  const progressPercent = nTotal > 0 ? (nComplete / nTotal) * 100 : 0;
  const sourceMetricValue = model?.metrics ? model.metrics[metric] ?? null : null;
  const improvementDelta = sourceMetricValue != null && bestValue != null ? bestValue - sourceMetricValue : null;
  const direction: 'maximize' | 'minimize' = metric.startsWith('neg_') || MINIMIZE_METRICS.has(metric)
    ? 'minimize'
    : 'maximize';

  const transitionTo = useCallback((next: Phase) => {
    setIsExiting(true);
    setTimeout(() => { setPhase(next); setIsExiting(false); }, 150);
  }, []);

  const handleStart = useCallback(async () => {
    if (!projectId) return;

    // Reset session
    setTrials([]);
    setBestValue(null);
    setPrevBestValue(null);
    setBestParams(null);
    setResultModelId(null);
    setErrorMessage(null);
    setImportances(null);
    setConvergenceStatus(null);
    setStartedAt(Date.now());
    transitionTo('discovery');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await startTuningApi(
        projectId,
        { modelId, nTrials, metric, timeoutSeconds, sampler },
        controller.signal,
      );

      for await (const event of readNdjsonStream<TuningStreamEvent>(response)) {
        if (controller.signal.aborted) break;

        switch (event.type) {
          case 'trial_result': {
            setTrials((prev) => [...prev, event]);
            setBestValue((prev) => { setPrevBestValue(prev); return event.best_value; });
            setBestParams(event.best_params);
            break;
          }
          case 'importance_update':
            setImportances(event.importances);
            break;
          case 'convergence_update':
            setConvergenceStatus(event.status);
            break;
          case 'done':
            setResultModelId(event.resultModelId ?? null);
            transitionTo('insight');
            if (projectId) await refreshModels(projectId);
            return;
          case 'error':
            setErrorMessage(event.message);
            transitionTo('error');
            return;
        }
      }

      // Stream ended without explicit done (edge case)
      if (!controller.signal.aborted) {
        transitionTo('insight');
        if (projectId) await refreshModels(projectId);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      transitionTo('error');
    }
  }, [projectId, modelId, nTrials, metric, timeoutSeconds, sampler, refreshModels, transitionTo]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    transitionTo('intent');
  }, [transitionTo]);

  const handleReset = useCallback(() => {
    setTrials([]);
    setBestValue(null);
    setPrevBestValue(null);
    setBestParams(null);
    setResultModelId(null);
    setErrorMessage(null);
    setImportances(null);
    setConvergenceStatus(null);
    setStartedAt(null);
    transitionTo('intent');
  }, [transitionTo]);

  const handleViewTunedModel = useCallback(async () => {
    if (!resultModelId || !projectId) return;
    await refreshModels(projectId);
    selectModel(resultModelId);
  }, [resultModelId, projectId, refreshModels, selectModel]);

  const templateParams = template?.parameters ?? [];
  const sourceParams = model?.parameters ?? {};

  return (
    <div className={cn('space-y-5 p-5', isExiting && 'tune-phase-exit')}>
      {phase === 'intent' && (
        <IntentPhase
          metric={metric}
          setMetric={setMetric}
          budget={budget}
          setBudget={(v) => setBudget(v as BudgetKey)}
          nTrials={nTrials}
          setNTrials={setNTrials}
          timeoutSeconds={timeoutSeconds}
          setTimeoutSeconds={setTimeoutSeconds}
          sampler={sampler}
          setSampler={setSampler}
          advancedOpen={advancedOpen}
          setAdvancedOpen={setAdvancedOpen}
          taskType={taskType}
          templateParams={templateParams}
          onStart={handleStart}
          disabled={!metric || !projectId}
        />
      )}

      {phase === 'discovery' && (
        <DiscoveryPhase
          metric={metric}
          budget={budget}
          nTrials={nTrials}
          trials={trials}
          bestValue={bestValue}
          prevBestValue={prevBestValue}
          improvementDelta={improvementDelta}
          nComplete={nComplete}
          nTotal={nTotal}
          progressPercent={progressPercent}
          startedAt={startedAt}
          importances={importances}
          convergenceStatus={convergenceStatus}
          direction={direction}
          onCancel={handleCancel}
        />
      )}

      {phase === 'insight' && (
        <InsightPhase
          metric={metric}
          trials={trials}
          bestValue={bestValue}
          bestParams={bestParams}
          improvementDelta={improvementDelta}
          nComplete={nComplete}
          nTotal={nTotal}
          startedAt={startedAt}
          importances={importances}
          resultModelId={resultModelId}
          sourceParams={sourceParams}
          direction={direction}
          onViewTunedModel={handleViewTunedModel}
          onTuneAgain={handleReset}
        />
      )}

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">Tuning Failed</p>
              <p className="text-sm text-muted-foreground">{errorMessage ?? 'An unknown error occurred.'}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Square, RotateCcw, ExternalLink, Trophy, Zap, AlertCircle } from 'lucide-react';
import { useModelStore } from '@/stores/modelStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useProjectThemeColor } from '@/hooks/useProjectThemeColor';
import { startTuning as startTuningApi } from '@/lib/api/experiments';
import { readNdjsonStream } from '@/lib/api/streamReader';
import { cn } from '@/lib/utils';
import { OptimizationHistoryChart } from '../charts/OptimizationHistoryChart';
import { TuneConfigForm } from './TuneConfigForm';
import { getAvailableMetrics } from '../utils';
import type { TuningTrialEvent } from '@/types/experiments';

type TunePhase = 'config' | 'running' | 'completed' | 'error';

interface DoneEvent { type: 'done'; resultModelId?: string }
interface ErrorEvent { type: 'error'; message: string }
type StreamEvent = TuningTrialEvent | DoneEvent | ErrorEvent;

const formatValue = (v: number): string => {
  if (!Number.isFinite(v)) return '--';
  return Math.abs(v) >= 1 ? v.toFixed(4) : v.toFixed(6);
};

export interface TuneTabProps { modelId: string }

export function TuneTab({ modelId }: TuneTabProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const model = useModelStore((s) => s.models.find((m) => m.modelId === modelId));
  const refreshModels = useModelStore((s) => s.refreshModels);
  const selectModel = useExperimentsStore((s) => s.selectModel);
  const { themeColor } = useProjectThemeColor(projectId ?? '');

  const [nTrials, setNTrials] = useState(50);
  const [metric, setMetric] = useState('');
  const [timeout, setTimeout_] = useState(600);
  const [phase, setPhase] = useState<TunePhase>('config');
  const [trials, setTrials] = useState<TuningTrialEvent[]>([]);
  const [bestValue, setBestValue] = useState<number | null>(null);
  const [bestParams, setBestParams] = useState<Record<string, unknown> | null>(null);
  const [resultModelId, setResultModelId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prevBest, setPrevBest] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const taskType = model?.taskType ?? 'classification';
  const availableMetrics = getAvailableMetrics(taskType);

  useEffect(() => {
    if (!metric && availableMetrics.length > 0) setMetric(availableMetrics[0].value);
  }, [metric, availableMetrics]);

  useEffect(() => () => { abortControllerRef.current?.abort(); }, []);

  const sourceMetricValue = model?.metrics ? model.metrics[metric] ?? null : null;

  const handleStartTuning = useCallback(async () => {
    if (!projectId) return;
    setPhase('running');
    setTrials([]);
    setBestValue(null);
    setBestParams(null);
    setResultModelId(null);
    setErrorMessage(null);
    setPrevBest(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await startTuningApi(
        projectId,
        { modelId, nTrials, metric, timeoutSeconds: timeout },
        controller.signal,
      );

      for await (const event of readNdjsonStream<StreamEvent>(response)) {
        if (controller.signal.aborted) break;
        if ('type' in event && event.type === 'done') {
          setResultModelId((event as DoneEvent).resultModelId ?? null);
          setPhase('completed');
          await refreshModels(projectId);
          return;
        }
        if ('type' in event && event.type === 'error') {
          setErrorMessage((event as ErrorEvent).message);
          setPhase('error');
          return;
        }
        if ('type' in event && event.type === 'trial_result') {
          const trial = event as TuningTrialEvent;
          setTrials((prev) => [...prev, trial]);
          setBestValue((prev) => { setPrevBest(prev); return trial.best_value; });
          setBestParams(trial.best_params);
        }
      }

      if (!controller.signal.aborted) {
        setPhase('completed');
        await refreshModels(projectId);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    }
  }, [projectId, modelId, nTrials, metric, timeout, refreshModels]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setPhase('config');
  }, []);

  const handleReset = useCallback(() => {
    setPhase('config');
    setTrials([]);
    setBestValue(null);
    setBestParams(null);
    setResultModelId(null);
    setErrorMessage(null);
    setPrevBest(null);
  }, []);

  const handleViewBestModel = useCallback(async () => {
    if (!resultModelId || !projectId) return;
    await refreshModels(projectId);
    selectModel(resultModelId);
  }, [resultModelId, projectId, refreshModels, selectModel]);

  const nComplete = trials.length > 0 ? trials[trials.length - 1].n_complete : 0;
  const nTotal = trials.length > 0 ? trials[trials.length - 1].n_total : nTrials;
  const progressPercent = nTotal > 0 ? (nComplete / nTotal) * 100 : 0;
  const bestImproved = prevBest !== null && bestValue !== null && bestValue !== prevBest;
  const improvementDelta =
    sourceMetricValue != null && bestValue != null ? bestValue - sourceMetricValue : null;

  if (phase === 'config') {
    return (
      <TuneConfigForm
        nTrials={nTrials}
        setNTrials={setNTrials}
        metric={metric}
        setMetric={setMetric}
        timeout={timeout}
        setTimeout_={setTimeout_}
        taskType={taskType}
        onStart={handleStartTuning}
        disabled={!metric || !projectId}
        themeColor={themeColor}
      />
    );
  }

  if (phase === 'running') {
    return (
      <div className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Tuning in Progress</h3>
          <Button variant="destructive" size="sm" onClick={handleCancel} className="gap-1.5">
            <Square className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{nComplete} / {nTotal} trials complete</span>
            <span className="font-mono tabular-nums text-muted-foreground">{Math.round(progressPercent)}%</span>
          </div>
          <Progress
            value={progressPercent}
            className="h-2.5"
            indicatorStyle={themeColor ? { backgroundColor: themeColor } : undefined}
          />
        </div>
        {bestValue != null && (
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-muted-foreground">Best score:</span>
            <Badge
              variant="secondary"
              className={cn(
                'font-mono tabular-nums text-sm transition-transform',
                bestImproved && 'animate-pulse scale-105',
              )}
            >
              {formatValue(bestValue)}
            </Badge>
          </div>
        )}
        <OptimizationHistoryChart trials={trials} height={320} />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="space-y-5 p-5">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Tuning Failed</p>
            <p className="text-sm text-muted-foreground">{errorMessage ?? 'An unknown error occurred.'}</p>
          </div>
        </div>
        {trials.length > 0 && (
          <>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Partial results: {trials.length} trial(s) recorded before failure.
              </p>
              {bestValue != null && (
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">
                    Best score: <span className="font-mono tabular-nums">{formatValue(bestValue)}</span>
                  </span>
                </div>
              )}
            </div>
            <OptimizationHistoryChart trials={trials} height={280} />
          </>
        )}
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  /* Completed state — flat layout, no Card wrapper */
  return (
    <div className="space-y-5 p-5">
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Zap className="h-4 w-4 text-emerald-500" />
          Tuning Complete
        </h3>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {bestValue != null && (
            <div className="space-y-0.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Best {metric}</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{formatValue(bestValue)}</p>
            </div>
          )}
          {improvementDelta != null && (
            <div className="space-y-0.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Improvement</p>
              <p className={cn(
                'text-lg font-bold tabular-nums',
                improvementDelta > 0 ? 'text-emerald-600 dark:text-emerald-400'
                  : improvementDelta < 0 ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground',
              )}>
                {improvementDelta > 0 ? '+' : ''}{formatValue(improvementDelta)}
              </p>
            </div>
          )}
          <div className="space-y-0.5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Trials</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {nComplete} / {nTotal}
            </p>
          </div>
        </div>

        {bestParams && Object.keys(bestParams).length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Best Parameters
            </p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Parameter</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(bestParams).map(([key, val]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="px-3 py-1.5 font-mono text-xs text-foreground">{key}</td>
                      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(6)) : String(val)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <OptimizationHistoryChart trials={trials} height={350} />

      <div className="flex flex-wrap items-center gap-3">
        {resultModelId && (
          <Button onClick={handleViewBestModel} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            View Best Model
          </Button>
        )}
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Run Again
        </Button>
      </div>
    </div>
  );
}

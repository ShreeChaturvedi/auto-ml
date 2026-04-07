import { useEffect, useReducer, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Loader2, Pin, AlertCircle } from 'lucide-react';
import type { DeploymentRecord, DeploymentSchema, PredictionResult } from '@/types/deployment';
import { getDeploymentSchema, predict } from '@/lib/api/deployments';
import { PlaygroundForm } from '../playground/PlaygroundForm';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

type InputMode = 'form' | 'json';

interface PinnedResult {
  id: number;
  input: Record<string, unknown>;
  result: PredictionResult;
}

interface PlaygroundState {
  features: Record<string, unknown>;
}

type PlaygroundAction =
  | { type: 'set_feature'; feature: string; value: unknown }
  | { type: 'set_all'; features: Record<string, unknown> };

function playgroundReducer(state: PlaygroundState, action: PlaygroundAction): PlaygroundState {
  switch (action.type) {
    case 'set_feature':
      return { ...state, features: { ...state.features, [action.feature]: action.value } };
    case 'set_all':
      return { ...state, features: action.features };
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface PlaygroundTabProps {
  deployment: DeploymentRecord;
}

export function PlaygroundTab({ deployment }: PlaygroundTabProps) {
  const [schema, setSchema] = useState<DeploymentSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(playgroundReducer, { features: {} });
  const [inputMode, setInputMode] = useState<InputMode>('form');
  const [jsonText, setJsonText] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [explain, setExplain] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedResult[]>([]);
  const [pinCounter, setPinCounter] = useState(0);

  const isHealthy = deployment.status === 'healthy';

  // Fetch schema on mount
  useEffect(() => {
    let cancelled = false;
    setSchemaError(null);
    getDeploymentSchema(deployment.deploymentId)
      .then((s) => {
        if (cancelled) return;
        setSchema(s);
        if (s.sampleRequest) {
          dispatch({ type: 'set_all', features: s.sampleRequest });
          setJsonText(JSON.stringify(s.sampleRequest, null, 2));
        }
      })
      .catch((err) => {
        if (!cancelled) setSchemaError(err instanceof Error ? err.message : 'Failed to load schema');
      });
    return () => { cancelled = true; };
  }, [deployment.deploymentId]);

  // Sync form state to JSON when switching modes
  const handleModeChange = useCallback(
    (mode: string) => {
      const next = mode as InputMode;
      if (next === 'json') {
        setJsonText(JSON.stringify(state.features, null, 2));
        setJsonError(null);
      } else {
        try {
          const parsed = JSON.parse(jsonText);
          dispatch({ type: 'set_all', features: parsed });
          setJsonError(null);
        } catch {
          // Keep current form state if JSON is invalid
        }
      }
      setInputMode(next);
    },
    [state.features, jsonText],
  );

  const handleFeatureChange = useCallback((feature: string, value: unknown) => {
    dispatch({ type: 'set_feature', feature, value });
  }, []);

  const handlePredict = useCallback(async () => {
    setLoading(true);
    setError(null);

    let input: Record<string, unknown>;
    if (inputMode === 'json') {
      try {
        input = JSON.parse(jsonText);
      } catch {
        setJsonError('Invalid JSON');
        setLoading(false);
        return;
      }
    } else {
      input = state.features;
    }

    try {
      const res = await predict(deployment.deploymentId, input, explain || undefined);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed');
    } finally {
      setLoading(false);
    }
  }, [deployment.deploymentId, inputMode, jsonText, state.features, explain]);

  const handlePin = useCallback(() => {
    if (!result) return;
    const input = inputMode === 'json' ? JSON.parse(jsonText) : { ...state.features };
    setPinCounter((c) => c + 1);
    setPinned((prev) => [...prev, { id: pinCounter + 1, input, result }]);
  }, [result, inputMode, jsonText, state.features, pinCounter]);

  if (schemaError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {schemaError}
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={inputMode} onValueChange={handleModeChange}>
          <TabsList className="h-8">
            <TabsTrigger value="form" className="px-3 text-xs">Form</TabsTrigger>
            <TabsTrigger value="json" className="px-3 text-xs">JSON</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Switch
            id="explain-toggle"
            checked={explain}
            onCheckedChange={setExplain}
            className="scale-90"
          />
          <Label htmlFor="explain-toggle" className="text-xs cursor-pointer select-none">
            Explain
          </Label>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {result && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={handlePin}>
              <Pin className="h-3 w-3" />
              Pin
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={!isHealthy || loading}
            onClick={handlePredict}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Predict
          </Button>
        </div>
      </div>

      {/* Split pane */}
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        {/* Left: input */}
        <div className="overflow-y-auto rounded-lg border bg-card p-4">
          {inputMode === 'form' ? (
            <PlaygroundForm schema={schema} values={state.features} onChange={handleFeatureChange} />
          ) : (
            <div className="flex h-full flex-col gap-2">
              <textarea
                className={cn(
                  'min-h-[200px] flex-1 resize-none rounded-md border bg-background p-3 font-mono text-xs',
                  'focus:outline-none focus:ring-1 focus:ring-ring',
                  jsonError && 'border-destructive',
                )}
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setJsonError(null);
                }}
                spellCheck={false}
              />
              {jsonError && (
                <p className="text-xs text-destructive">{jsonError}</p>
              )}
            </div>
          )}
        </div>

        {/* Right: result */}
        <div className="overflow-y-auto rounded-lg border bg-card p-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {!result && !error && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Run a prediction to see results
            </div>
          )}

          {result && <ResultDisplay result={result} schema={schema} />}

          {/* Pinned comparisons */}
          {pinned.length > 0 && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Pinned ({pinned.length})
              </p>
              {pinned.map((p) => (
                <div key={p.id} className="rounded-md border bg-muted/30 p-3">
                  <ResultDisplay result={p.result} schema={schema} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Result display (inline — no separate file needed for now)          */
/* ------------------------------------------------------------------ */

function ResultDisplay({
  result,
  schema,
  compact = false,
}: {
  result: PredictionResult;
  schema: DeploymentSchema;
  compact?: boolean;
}) {
  const isClassification = schema.taskType === 'classification';

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {/* Main prediction */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prediction</p>
        <p className={cn('font-semibold tabular-nums', compact ? 'text-sm' : 'text-lg')}>
          {String(result.prediction)}
        </p>
      </div>

      {/* Probabilities (classification) */}
      {isClassification && result.probabilities && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Probabilities</p>
          {Object.entries(result.probabilities)
            .sort(([, a], [, b]) => b - a)
            .map(([label, prob]) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="w-20 truncate text-muted-foreground">{label}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
                    style={{ width: `${(prob * 100).toFixed(1)}%` }}
                  />
                </div>
                <span className="w-12 text-right tabular-nums text-muted-foreground">
                  {(prob * 100).toFixed(1)}%
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Prediction interval (regression) */}
      {!isClassification && result.predictionInterval && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">95% Interval</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            [{result.predictionInterval.lower.toFixed(2)}, {result.predictionInterval.upper.toFixed(2)}]
          </p>
        </div>
      )}

      {/* SHAP values (explain mode) */}
      {result.shapValues && result.shapValues.length > 0 && !compact && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Feature Attribution</p>
          {result.shapValues
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .slice(0, 10)
            .map(({ feature, value }) => {
              const maxAbs = Math.max(...result.shapValues!.map((s) => Math.abs(s.value)));
              const pct = maxAbs > 0 ? (Math.abs(value) / maxAbs) * 100 : 0;
              const positive = value >= 0;
              return (
                <div key={feature} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate text-muted-foreground">{feature}</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        'absolute inset-y-0 rounded-full transition-all',
                        positive ? 'left-1/2 bg-emerald-500' : 'right-1/2 bg-rose-500',
                      )}
                      style={{ width: `${pct / 2}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'w-14 text-right tabular-nums',
                      positive ? 'text-emerald-600' : 'text-rose-600',
                    )}
                  >
                    {value >= 0 ? '+' : ''}
                    {value.toFixed(3)}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

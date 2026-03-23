import { Play, ChevronRight, ChevronDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAvailableMetrics } from '@/components/experiments/utils';
import type { ModelTemplateParam } from '@/types/model';
import { BudgetRadioGroup } from '../components/BudgetRadioGroup';
import { SearchSpaceEditor } from '../components/SearchSpaceEditor';

interface IntentPhaseProps {
  metric: string;
  setMetric: (v: string) => void;
  budget: string;
  setBudget: (v: string) => void;
  nTrials: number;
  setNTrials: (v: number) => void;
  timeoutSeconds: number;
  setTimeoutSeconds: (v: number) => void;
  sampler: 'tpe' | 'random';
  setSampler: (v: 'tpe' | 'random') => void;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
  taskType: string;
  templateParams: ModelTemplateParam[];
  onStart: () => void;
  disabled: boolean;
}

export function IntentPhase({
  metric,
  setMetric,
  budget,
  setBudget,
  nTrials,
  setNTrials,
  timeoutSeconds,
  setTimeoutSeconds,
  sampler,
  setSampler,
  advancedOpen,
  setAdvancedOpen,
  taskType,
  templateParams,
  onStart,
  disabled,
}: IntentPhaseProps) {
  const metrics = getAvailableMetrics(taskType);

  return (
    <div className="space-y-4">
      {/* Layer 1 -- Surface */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Optimization Metric</Label>
        <Select value={metric} onValueChange={setMetric}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent>
            {metrics.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Budget</Label>
        <BudgetRadioGroup value={budget} onChange={setBudget} />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between pt-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="gap-1 text-xs text-muted-foreground"
        >
          {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Advanced
        </Button>

        <div className="flex items-center gap-3">
          <Button onClick={onStart} disabled={disabled} size="sm" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Start Tuning
          </Button>
          <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted-foreground/20">
            Powered by Optuna
          </Badge>
        </div>
      </div>

      {/* Layer 2 -- Advanced */}
      {advancedOpen && (
        <div className="space-y-4 rounded-lg border border-border/30 bg-muted/20 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Trials</Label>
              <Input
                type="number"
                min={5}
                max={500}
                value={nTrials}
                onChange={(e) => setNTrials(Number(e.target.value))}
                className="h-9 text-sm font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Timeout (seconds)</Label>
              <Input
                type="number"
                min={30}
                max={3600}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                className="h-9 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Sampler</Label>
            <Select value={sampler} onValueChange={(v) => setSampler(v as 'tpe' | 'random')}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tpe">TPE (Tree-structured Parzen Estimator)</SelectItem>
                <SelectItem value="random">Random</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {templateParams.length > 0 && <SearchSpaceEditor params={templateParams} />}
        </div>
      )}

      {/* Layer 3 -- Info card (always visible in intent) */}
      <div className="flex items-start gap-3 rounded-lg border border-border/30 bg-muted/20 p-4 mt-4">
        <Zap className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Hyperparameter Tuning</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Optuna will search for the best hyperparameter combination using Bayesian optimization.
            The search space is derived from the model template. Results are saved as a new model variant.
          </p>
        </div>
      </div>
    </div>
  );
}

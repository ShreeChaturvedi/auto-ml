import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play } from 'lucide-react';
import { getAvailableMetrics } from '../utils';

export interface TuneConfigFormProps {
  nTrials: number;
  setNTrials: (v: number) => void;
  metric: string;
  setMetric: (v: string) => void;
  timeout: number;
  setTimeout_: (v: number) => void;
  taskType: string;
  onStart: () => void;
  disabled: boolean;
}

export function TuneConfigForm({
  nTrials,
  setNTrials,
  metric,
  setMetric,
  timeout,
  setTimeout_,
  taskType,
  onStart,
  disabled,
}: TuneConfigFormProps) {
  const availableMetrics = getAvailableMetrics(taskType);

  return (
    <div className="space-y-6 p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Hyperparameter Tuning
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Search for optimal hyperparameters using Optuna. Configure the study
          below and start tuning.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="n-trials" className="text-sm font-medium">
          Number of Trials
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id="n-trials"
            type="range"
            min={10}
            max={200}
            step={10}
            value={nTrials}
            onChange={(e) => setNTrials(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-auto border-0 bg-transparent p-0"
          />
          <span className="w-10 text-right text-sm font-mono tabular-nums text-foreground">
            {nTrials}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Range: 10 - 200 (step 10)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="metric-select" className="text-sm font-medium">
          Optimization Metric
        </Label>
        <Select value={metric} onValueChange={setMetric}>
          <SelectTrigger id="metric-select" className="w-full max-w-xs">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent>
            {availableMetrics.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timeout" className="text-sm font-medium">
          Timeout (seconds)
        </Label>
        <Input
          id="timeout"
          type="number"
          min={60}
          max={3600}
          step={60}
          value={timeout}
          onChange={(e) => setTimeout_(Number(e.target.value))}
          className="w-full max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          Maximum wall-clock time for the study. Default: 600s.
        </p>
      </div>

      <Button onClick={onStart} disabled={disabled} className="gap-2">
        <Play className="h-4 w-4" />
        Start Tuning
      </Button>
    </div>
  );
}

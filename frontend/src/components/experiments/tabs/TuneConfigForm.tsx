import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="p-5">
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold tracking-tight">Hyperparameter Tuning</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Search for optimal hyperparameters using Optuna.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="n-trials" className="text-xs font-medium">
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
            <p className="text-[11px] text-muted-foreground">Range: 10–200 (step 10)</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="metric-select" className="text-xs font-medium">
                Optimization Metric
              </Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger id="metric-select" className="h-8 text-xs">
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

            <div className="space-y-1.5">
              <Label htmlFor="timeout" className="text-xs font-medium">
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
                className="h-8 text-xs"
              />
            </div>
          </div>

          <Button onClick={onStart} disabled={disabled} size="sm" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Start Tuning
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

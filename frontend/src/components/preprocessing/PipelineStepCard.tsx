import type { ChangeEvent } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import type { PreprocessingAction, PreprocessingStep } from '@/types/preprocessing';
import { PREPROCESSING_ACTION_LABELS } from '@/types/preprocessing';

interface PipelineStepCardProps {
  step: PreprocessingStep;
  index: number;
  totalSteps: number;
  onUpdate: (id: string, updates: Partial<PreprocessingStep>) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
}

export function PipelineStepCard({
  step,
  index,
  totalSteps,
  onUpdate,
  onRemove,
  onMove
}: PipelineStepCardProps) {
  const handleColumnsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const columns = value.split(',').map(c => c.trim()).filter(Boolean);
    onUpdate(step.id, { columns });
  };

  const isCustomPython = step.action === 'custom_python';

  return (
    <Card className={`relative transition-opacity ${!step.enabled ? 'opacity-60' : ''}`}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs shrink-0 bg-background">
                Step {index + 1}
              </Badge>
              <Input
                value={step.title || ''}
                onChange={e => onUpdate(step.id, { title: e.target.value })}
                placeholder="Step Title"
                className="h-7 text-sm font-semibold border-none focus-visible:ring-1 focus-visible:ring-offset-0 px-1 py-0 shadow-none bg-transparent"
              />
            </div>
            {step.reasoning ? <p className="text-xs text-muted-foreground line-clamp-2 px-1">{step.reasoning}</p> : null}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-4">
            <Switch
              checked={step.enabled}
              onCheckedChange={enabled => onUpdate(step.id, { enabled })}
              aria-label="Toggle step"
            />
            <div className="flex flex-col gap-0.5 ml-2 border-l pl-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-sm"
                onClick={() => onMove(index, 'up')}
                disabled={index === 0}
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-sm"
                onClick={() => onMove(index, 'down')}
                disabled={index === totalSteps - 1}
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onRemove(step.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Action</Label>
            <Select
              value={step.action}
              onValueChange={(action) => onUpdate(step.id, { action: action as PreprocessingAction })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select Action" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PREPROCESSING_ACTION_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Method (Optional)</Label>
            <Input
              value={step.method || ''}
              onChange={e => onUpdate(step.id, { method: e.target.value })}
              placeholder="e.g. mean, minmax"
              className="h-8 text-sm"
              disabled={isCustomPython}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Target Columns (comma separated)</Label>
          <Input
            value={step.columns.join(', ')}
            onChange={handleColumnsChange}
            placeholder="col1, col2, ..."
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Reasoning</Label>
          <Textarea
            value={step.reasoning}
            onChange={(e) => onUpdate(step.id, { reasoning: e.target.value })}
            className="min-h-[64px] resize-y text-sm"
            placeholder="Why this step is included"
          />
        </div>

        {isCustomPython && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Python Code</Label>
            <Textarea
              value={step.customCode || ''}
              onChange={e => onUpdate(step.id, { customCode: e.target.value })}
              placeholder={'# pandas code\n# example: df = df.dropna()'}
              className="font-mono text-xs min-h-[100px]"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

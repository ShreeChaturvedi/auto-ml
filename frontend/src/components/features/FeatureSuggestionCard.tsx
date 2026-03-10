import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { FeatureSuggestionItem } from './featureEngineeringUtils';
import { buildSuggestionDefaults } from './featureEngineeringUtils';
import type { SuggestionDraft } from './hooks/useFeaturePipelineState';

interface FeatureSuggestionCardProps {
  item: FeatureSuggestionItem;
  draft: SuggestionDraft | undefined;
  isApproved: boolean;
  datasetColumns: string[];
  onToggle: (item: FeatureSuggestionItem, enabled: boolean) => void;
  onControlChange: (item: FeatureSuggestionItem, key: string, value: unknown) => void;
}

export function FeatureSuggestionCard({
  item,
  draft: draftProp,
  isApproved,
  datasetColumns,
  onToggle,
  onControlChange
}: FeatureSuggestionCardProps) {
  const draft: SuggestionDraft = draftProp ?? {
    enabled: false,
    params: buildSuggestionDefaults(item)
  };

  return (
    <Card className={cn('border', draft.enabled && 'border-foreground/40')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{item.feature.featureName}</p>
            <p className="text-xs text-muted-foreground">{item.rationale}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'text-xs',
              draft.enabled
                ? 'border-foreground/50 bg-foreground/10 text-foreground'
                : 'border-border/60 text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onToggle(item, !draft.enabled)}
            disabled={isApproved}
          >
            {draft.enabled ? 'Enabled' : 'Enable'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5">{item.feature.method}</span>
          <span className="rounded bg-muted px-2 py-0.5">{item.impact} impact</span>
        </div>

        {item.controls?.length ? (
          <div className="grid gap-3">
            {item.controls.map((control) => {
              const controlValue = draft.params[control.key] ?? control.value;

              return (
                <div key={control.key} className="space-y-1">
                  <Label className="text-xs">{control.label}</Label>
                  {control.type === 'boolean' ? (
                    <Switch
                      checked={Boolean(controlValue)}
                      onCheckedChange={(checked) => onControlChange(item, control.key, checked)}
                      disabled={isApproved}
                    />
                  ) : (control.type === 'select' || control.type === 'column') &&
                    (control.options || datasetColumns.length > 0) ? (
                    <Select
                      value={String(controlValue ?? '')}
                      onValueChange={(value) => onControlChange(item, control.key, value)}
                      disabled={isApproved}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          control.options ??
                          datasetColumns.map((column) => ({ value: column, label: column }))
                        ).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={control.type === 'number' ? 'number' : 'text'}
                      value={String(controlValue ?? '')}
                      onChange={(event) => {
                        const nextValue =
                          control.type === 'number'
                            ? event.currentTarget.valueAsNumber
                            : event.currentTarget.value;
                        onControlChange(
                          item,
                          control.key,
                          Number.isNaN(nextValue as number) ? control.value : nextValue
                        );
                      }}
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      className="h-8 text-xs"
                      disabled={isApproved}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

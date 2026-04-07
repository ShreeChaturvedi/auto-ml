import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FeatureSuggestionItem } from './featureEngineeringUtils';
import {
  buildSuggestionDefaults,
  captureFeatureLeftPaneScrollTop
} from './featureEngineeringUtils';
import type { SuggestionDraft } from './hooks/useFeaturePipelineState';

interface FeatureSuggestionCardProps {
  item: FeatureSuggestionItem;
  draft: SuggestionDraft | undefined;
  datasetColumns: string[];
  onToggle: (item: FeatureSuggestionItem, enabled: boolean) => void;
  onControlChange: (item: FeatureSuggestionItem, key: string, value: unknown) => void;
}

export function FeatureSuggestionCard({
  item,
  draft: draftProp,
  datasetColumns,
  onToggle,
  onControlChange
}: FeatureSuggestionCardProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const draft: SuggestionDraft = draftProp ?? {
    enabled: false,
    params: buildSuggestionDefaults(item)
  };

  const getScrollContainerState = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return;
    const scrollContainer = target.closest('[data-fe-left-pane-scroll="true"]');
    if (scrollContainer instanceof HTMLElement) {
      captureFeatureLeftPaneScrollTop(scrollContainer.scrollTop);
      return {
        scrollContainer,
        scrollTop: scrollContainer.scrollTop
      };
    }
    return undefined;
  };

  const scheduleScrollRestore = (
    scrollContainer: HTMLElement | undefined,
    scrollTop: number | undefined
  ) => {
    if (!scrollContainer || typeof scrollTop !== 'number') {
      return;
    }

    const restore = () => {
      if (!scrollContainer.isConnected) {
        return;
      }
      scrollContainer.scrollTop = scrollTop;
    };

    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 0);
    window.setTimeout(restore, 120);
    window.setTimeout(restore, 300);
    const intervalId = window.setInterval(restore, 50);
    window.setTimeout(() => {
      window.clearInterval(intervalId);
    }, 1000);
  };

  return (
    <Card className={cn('border', draft.enabled && 'border-foreground/40')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{item.feature.featureName}</p>
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDetailsExpanded((current) => !current)}
            >
              {detailsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              What this feature does
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'text-xs',
              draft.enabled
                ? 'border-foreground/50 bg-foreground/10 text-foreground'
                : 'border-border/60 text-muted-foreground hover:text-foreground'
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              getScrollContainerState(event.currentTarget);
            }}
            onClick={(event) => {
              const scrollState = getScrollContainerState(event.currentTarget);
              onToggle(item, !draft.enabled);
              scheduleScrollRestore(scrollState?.scrollContainer, scrollState?.scrollTop);
            }}
          >
            {draft.enabled ? 'Enabled' : 'Enable'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5">{item.feature.method}</span>
          <span className="rounded bg-muted px-2 py-0.5">{item.impact} impact</span>
        </div>

        {detailsExpanded ? (
          <div className="space-y-1 rounded border border-border/60 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
            <p>{item.rationale}</p>
            <p>
              Source column: <span className="font-medium text-foreground">{item.feature.sourceColumn}</span>
            </p>
            {item.feature.secondaryColumn ? (
              <p>
                Secondary column: <span className="font-medium text-foreground">{item.feature.secondaryColumn}</span>
              </p>
            ) : null}
          </div>
        ) : null}

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
                      onCheckedChange={(checked) => {
                        const scrollState = getScrollContainerState(document.activeElement);
                        onControlChange(item, control.key, checked);
                        scheduleScrollRestore(scrollState?.scrollContainer, scrollState?.scrollTop);
                      }}
                    />
                  ) : (control.type === 'select' || control.type === 'column') &&
                    (control.options || datasetColumns.length > 0) ? (
                    <Select
                      value={String(controlValue ?? '')}
                      onValueChange={(value) => {
                        const scrollState = getScrollContainerState(document.activeElement);
                        onControlChange(item, control.key, value);
                        scheduleScrollRestore(scrollState?.scrollContainer, scrollState?.scrollTop);
                      }}
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
                        const scrollState = getScrollContainerState(event.currentTarget);
                        const nextValue =
                          control.type === 'number'
                            ? event.currentTarget.valueAsNumber
                            : event.currentTarget.value;
                        onControlChange(
                          item,
                          control.key,
                          Number.isNaN(nextValue as number) ? control.value : nextValue
                        );
                        scheduleScrollRestore(scrollState?.scrollContainer, scrollState?.scrollTop);
                      }}
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      className="h-8 text-xs"
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

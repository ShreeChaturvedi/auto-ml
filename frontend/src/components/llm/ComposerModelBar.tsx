/**
 * ComposerModelBar - Model and reasoning effort selection dropdowns with context usage indicator.
 */

import { useMemo, type ReactNode } from 'react';

import { Info } from 'lucide-react';

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses } from '@/types/project';
import {
  DEFAULT_ASSISTANT_MODEL,
  getModelOption,
  type AssistantModelOption,
  type ReasoningEffort,
  type ReasoningIcon
} from './modelOptions';
import { ContextUsageIndicator } from './ContextUsageIndicator';
import type { ModelConfig, ReasoningConfig, UsageConfig } from './LlmChatComposer';

import {
  Ban,
  Brain,
  Code2,
  Crown,
  Flame,
  Gauge,
  Rocket,
  Zap
} from 'lucide-react';

/** Compact dropdown group label; smaller than option text (text-sm). */
const SELECT_GROUP_LABEL_CLASS =
  'px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider';

function renderModelIcon(option: AssistantModelOption, iconColorClass?: string): ReactNode {
  const cls = cn('h-3 w-3', iconColorClass);

  if (option.value === DEFAULT_ASSISTANT_MODEL) {
    return <Crown className={cls} />;
  }

  switch (option.kind) {
    case 'codex':
      return <Code2 className={cls} />;
    case 'mini':
      return <Zap className={cls} />;
    case 'nano':
      return <Gauge className={cls} />;
    case 'base':
    default:
      return <Crown className={cls} />;
  }
}

function renderReasoningIcon(icon: ReasoningIcon, iconColorClass?: string): ReactNode {
  const cls = cn('h-3 w-3', iconColorClass);
  switch (icon) {
    case 'slash': return <Ban className={cls} />;
    case 'zap': return <Zap className={cls} />;
    case 'gauge': return <Gauge className={cls} />;
    case 'brain': return <Brain className={cls} />;
    case 'flame': return <Flame className={cls} />;
    case 'rocket': return <Rocket className={cls} />;
  }
}

interface ComposerModelBarProps {
  modelConfig: ModelConfig;
  reasoningConfig: ReasoningConfig;
  usageConfig?: UsageConfig;
}

export function ComposerModelBar({
  modelConfig,
  reasoningConfig,
  usageConfig
}: ComposerModelBarProps) {
  const { model, onModelChange, modelOptions } = modelConfig;
  const { reasoningEffort, onReasoningEffortChange, reasoningOptions } = reasoningConfig;

  const activeProject = useProjectStore((s) => s.getActiveProject());
  const projectIconColorClass = activeProject
    ? projectColorClasses[activeProject.color]?.text
    : undefined;

  const currentModelOption = useMemo(
    () => getModelOption(model, modelOptions),
    [model, modelOptions]
  );

  return (
    <div className="hidden lg:flex shrink-0 flex-nowrap items-center gap-2">
      <Select value={currentModelOption.value} onValueChange={onModelChange}>
        <SelectTrigger className="flex h-7 w-fit min-w-[8.25rem] max-w-none shrink-0 flex-nowrap gap-2 px-2.5 text-xs [&>div]:flex [&>div]:flex-nowrap [&>div]:min-w-0 [&>div]:overflow-hidden">
          <div className="flex min-w-0 shrink flex-nowrap items-center gap-2 whitespace-nowrap">
            <span className="shrink-0">{renderModelIcon(currentModelOption, projectIconColorClass)}</span>
            <span className="min-w-0 truncate">{currentModelOption.label}</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className={SELECT_GROUP_LABEL_CLASS}>
              Model
            </SelectLabel>
            {modelOptions.map((option) => {
              const isSelected = option.value === model;
              return (
              <SelectItem key={option.value} value={option.value} indicatorClassName={isSelected ? projectIconColorClass : undefined}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">{renderModelIcon(option, isSelected ? projectIconColorClass : undefined)}</span>
                <span className="truncate">{option.label}</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        aria-label={`${option.label} usage tip`}
                        className="inline-flex shrink-0 text-muted-foreground"
                      >
                        <Info className="h-3 w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      {option.description}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </SelectItem>
          );})}
          </SelectGroup>
        </SelectContent>
      </Select>

      {reasoningOptions.length > 0 ? (
        <Select value={reasoningEffort} onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}>
          <SelectTrigger className="h-7 w-fit min-w-[7.5rem] gap-2 px-2.5 text-xs">
            <SelectValue placeholder="Reasoning">
              {(() => {
                const opt = reasoningOptions.find((o) => o.value === reasoningEffort);
                return opt ? (
                  <span className="flex items-center gap-1.5">
                    {renderReasoningIcon(opt.icon, projectIconColorClass)}
                    {opt.label}
                  </span>
                ) : null;
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className={SELECT_GROUP_LABEL_CLASS}>
                Reasoning
              </SelectLabel>
              {reasoningOptions.map((option) => {
                const isSelected = option.value === reasoningEffort;
                return (
                <SelectItem key={option.value} value={option.value} indicatorClassName={isSelected ? projectIconColorClass : undefined}>
                  <span className="flex items-center gap-1.5">
                    {renderReasoningIcon(option.icon, isSelected ? projectIconColorClass : undefined)}
                    {option.label}
                  </span>
                </SelectItem>
              );})}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}

      {usageConfig && usageConfig.sessionUsages.length > 0 ? (
        <ContextUsageIndicator
          sessionUsages={usageConfig.sessionUsages}
          model={usageConfig.model}
          projectColorClass={projectIconColorClass}
          projectBgColorClass={activeProject ? projectColorClasses[activeProject.color]?.bg : undefined}
          projectColor={activeProject?.color === 'custom' ? activeProject.customColor : undefined}
        />
      ) : null}
    </div>
  );
}

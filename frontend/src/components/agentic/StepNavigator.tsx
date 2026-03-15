/**
 * StepNavigator - Sticky horizontal progress bar showing pipeline steps.
 *
 * Renders connected dots for each step with the current step highlighted.
 * Each dot is clickable (scrolls the viewport to the corresponding step element).
 */

import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export type StepStatus = 'pending' | 'active' | 'done' | 'failed';

export interface NavigatorStep {
  id: string;
  label: string;
  status: StepStatus;
}

export interface StepNavigatorProps {
  steps: NavigatorStep[];
  currentStepIndex: number;
}

const STATUS_DOT: Record<StepStatus, string> = {
  pending: 'border-muted-foreground/40 bg-background',
  active: 'border-primary bg-primary ring-2 ring-primary/20',
  done: 'border-emerald-500 bg-emerald-500',
  failed: 'border-destructive bg-destructive',
};

const STATUS_LABEL: Record<StepStatus, string> = {
  pending: 'text-muted-foreground/60',
  active: 'text-primary font-medium',
  done: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
};

const STATUS_CONNECTOR: Record<StepStatus, string> = {
  pending: 'bg-muted-foreground/20',
  active: 'bg-primary/40',
  done: 'bg-emerald-500/50',
  failed: 'bg-destructive/40',
};

export function StepNavigator({ steps, currentStepIndex }: StepNavigatorProps) {
  const handleStepClick = useCallback((stepId: string) => {
    const el = document.querySelector(`[data-step-id="${stepId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  if (steps.length === 0) return null;

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-2">
      <div className="flex items-center gap-1">
        {/* Step counter label */}
        <span className="mr-2 shrink-0 text-[10px] font-medium text-muted-foreground tabular-nums">
          Step {currentStepIndex + 1} of {steps.length}
        </span>

        {/* Connected dots */}
        <div className="flex flex-1 items-center">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              {/* Connector line (before each dot except the first) */}
              {index > 0 && (
                <div
                  className={cn(
                    'h-0.5 w-6 transition-colors duration-200',
                    STATUS_CONNECTOR[steps[index - 1].status],
                  )}
                />
              )}

              {/* Dot + label */}
              <button
                type="button"
                onClick={() => handleStepClick(step.id)}
                className="group flex flex-col items-center gap-0.5"
                title={step.label}
              >
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full border-2 transition-all duration-200',
                    'group-hover:scale-125',
                    STATUS_DOT[step.status],
                  )}
                />
                <span
                  className={cn(
                    'max-w-[60px] truncate text-[9px] leading-none transition-colors',
                    STATUS_LABEL[step.status],
                  )}
                >
                  {step.label}
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* Current step description */}
        {steps[currentStepIndex] && (
          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
            {steps[currentStepIndex].label}
          </span>
        )}
      </div>
    </div>
  );
}

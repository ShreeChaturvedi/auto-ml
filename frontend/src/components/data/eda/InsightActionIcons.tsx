/**
 * InsightActionIcons — renders a row of small icon buttons for insight actions.
 * Each icon has a descriptive tooltip explaining the action in context.
 */

import { Filter, TerminalSquare, Wand2, Code2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import type { InsightAction, InsightActionType } from './edaInsights';

export interface InsightActionIconsProps {
  actions: InsightAction[];
  onAction: (action: InsightAction) => void;
}

const actionMeta: Record<InsightActionType, { icon: LucideIcon; label: string }> = {
  filter: { icon: Filter, label: 'Filter' },
  query: { icon: TerminalSquare, label: 'Query' },
  preprocess: { icon: Wand2, label: 'Preprocess' },
  notebook: { icon: Code2, label: 'Notebook' },
};

/**
 * Build a human-friendly tooltip for an insight action.
 */
function actionTooltip(action: InsightAction): string {
  const col = action.columns[0] ?? 'column';
  const cols = action.columns.join(', ');

  switch (action.issueType) {
    case 'missing':
      switch (action.type) {
        case 'filter':  return `Filter to rows where ${col} is NULL`;
        case 'query':   return `Query missing values in ${col}`;
        case 'preprocess': return `Impute or drop missing values in ${col}`;
        case 'notebook':   return `Generate notebook code for ${col} missing analysis`;
      }
      break;
    case 'outlier':
      switch (action.type) {
        case 'filter':  return `Filter to outlier rows in ${col}`;
        case 'query':   return `Query outliers in ${col}`;
        case 'notebook':   return `Generate notebook code for ${col} outlier analysis`;
      }
      break;
    case 'skew':
      if (action.type === 'notebook') return `Generate notebook code for ${col} skew transform`;
      break;
    case 'correlation':
      switch (action.type) {
        case 'query':   return `Query relationship between ${cols}`;
        case 'notebook':   return `Generate notebook code for ${cols} correlation`;
      }
      break;
    case 'constant':
      if (action.type === 'preprocess') return `Drop constant column ${col}`;
      break;
    case 'cardinality':
      switch (action.type) {
        case 'query':   return `Query distinct values in ${col}`;
        case 'notebook':   return `Generate notebook code for ${col} cardinality`;
      }
      break;
    case 'imbalance':
      switch (action.type) {
        case 'query':   return `Query class distribution of ${col}`;
        case 'preprocess': return `Resample or balance ${col}`;
        case 'notebook':   return `Generate notebook code for ${col} class balance`;
      }
      break;
  }

  // Generic fallback
  return `${actionMeta[action.type].label} ${cols}`;
}

export function InsightActionIcons({ actions, onAction }: InsightActionIconsProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <span className="inline-flex items-center gap-0.5 shrink-0 ml-1">
        {actions.map((action, i) => {
          const meta = actionMeta[action.type];
          const Icon = meta.icon;
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction(action);
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {actionTooltip(action)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </span>
    </TooltipProvider>
  );
}

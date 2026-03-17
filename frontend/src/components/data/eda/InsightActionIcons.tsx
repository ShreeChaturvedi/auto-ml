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
} from '@/components/ui/tooltip';
import type { InsightAction, InsightIssueType, InsightActionType } from './edaInsights';

export interface InsightActionIconsProps {
  actions: InsightAction[];
  onAction: (action: InsightAction) => void;
}

type TooltipKey = `${InsightIssueType}:${InsightActionType}`;

const TOOLTIP_MAP: Partial<Record<TooltipKey, (col: string, cols: string) => string>> = {
  'missing:filter':     (col) => `Filter to rows where ${col} is NULL`,
  'missing:query':      (col) => `Query missing values in ${col}`,
  'missing:preprocess': (col) => `Impute or drop missing values in ${col}`,
  'missing:notebook':   (col) => `Generate notebook code for ${col} missing analysis`,
  'outlier:filter':     (col) => `Filter to outlier rows in ${col}`,
  'outlier:query':      (col) => `Query outliers in ${col}`,
  'outlier:notebook':   (col) => `Generate notebook code for ${col} outlier analysis`,
  'skew:notebook':      (col) => `Generate notebook code for ${col} skew transform`,
  'correlation:query':  (_col, cols) => `Query relationship between ${cols}`,
  'correlation:notebook':(_col, cols) => `Generate notebook code for ${cols} correlation`,
  'constant:preprocess':(col) => `Drop constant column ${col}`,
  'cardinality:query':  (col) => `Query distinct values in ${col}`,
  'cardinality:notebook':(col) => `Generate notebook code for ${col} cardinality`,
  'imbalance:query':    (col) => `Query class distribution of ${col}`,
  'imbalance:preprocess':(col) => `Resample or balance ${col}`,
  'imbalance:notebook': (col) => `Generate notebook code for ${col} class balance`,
};

const ACTION_LABELS: Record<InsightActionType, string> = {
  filter: 'Filter',
  query: 'Query',
  preprocess: 'Preprocess',
  notebook: 'Notebook',
};

const ACTION_ICONS: Record<InsightActionType, LucideIcon> = {
  filter: Filter,
  query: TerminalSquare,
  preprocess: Wand2,
  notebook: Code2,
};

function actionTooltip(action: InsightAction): string {
  const col = action.columns[0] ?? 'column';
  const cols = action.columns.join(', ');
  const key: TooltipKey = `${action.issueType}:${action.type}`;
  return TOOLTIP_MAP[key]?.(col, cols) ?? `${ACTION_LABELS[action.type]} ${cols}`;
}

export function InsightActionIcons({ actions, onAction }: InsightActionIconsProps) {
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0 ml-1">
      {actions.map((action, i) => {
        const Icon = ACTION_ICONS[action.type];
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={actionTooltip(action)}
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
  );
}

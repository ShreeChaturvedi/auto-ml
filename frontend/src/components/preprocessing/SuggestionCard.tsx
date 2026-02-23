/**
 * SuggestionCard - Interactive card for a single preprocessing suggestion
 * 
 * Renders the appropriate UI controls based on the suggestion's uiConfig.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  AlertTriangle, 
  AlertCircle, 
  AlertOctagon,
  Info, 
  HelpCircle,
  CircleDashed,
  TrendingUp,
  Maximize2,
  Hash,
  RefreshCw,
  BarChart2,
  Layers,
  Minus,
  Copy
} from 'lucide-react';
import type { PreprocessingSuggestion, Severity, PreprocessingType } from '@/types/preprocessing';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { cn } from '@/lib/utils';

interface SuggestionCardProps {
  suggestion: PreprocessingSuggestion;
}

const severityIcons: Record<Severity, typeof AlertTriangle> = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
  info: HelpCircle
};

const severityColors: Record<Severity, { badge: string; border: string }> = {
  critical: { 
    badge: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
    border: 'border-red-200 dark:border-red-900'
  },
  high: { 
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-900'
  },
  medium: { 
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-900'
  },
  low: { 
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-900'
  },
  info: { 
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-800'
  }
};

const typeIcons: Record<PreprocessingType, typeof CircleDashed> = {
  missing_values: CircleDashed,
  outliers: TrendingUp,
  scaling: Maximize2,
  encoding: Hash,
  type_conversion: RefreshCw,
  skewness: BarChart2,
  high_cardinality: Layers,
  constant_column: Minus,
  duplicate_detection: Copy
};

export function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const suggestionState = usePreprocessingStore(s => s.getSuggestionState(suggestion.id));
  const toggleSuggestion = usePreprocessingStore(s => s.toggleSuggestion);
  const updateSuggestionMethod = usePreprocessingStore(s => s.updateSuggestionMethod);

  const isEnabled = suggestionState?.enabled ?? suggestion.enabled;
  const currentMethod = suggestionState?.method ?? suggestion.method;

  const SeverityIcon = severityIcons[suggestion.severity];
  const TypeIcon = typeIcons[suggestion.type];
  const colors = severityColors[suggestion.severity];

  return (
    <Card className={cn(
      'relative transition-all duration-200',
      colors.border,
      isEnabled ? 'ring-1 ring-primary/20' : 'opacity-75'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={cn(
              'rounded-lg p-2 shrink-0',
              colors.badge
            )}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {suggestion.title}
                <Tooltip>
                  <TooltipTrigger>
                    <Badge 
                      variant="secondary" 
                      className={cn('gap-1 text-xs', colors.badge)}
                    >
                      <SeverityIcon className="h-3 w-3" />
                      {suggestion.severity}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-medium mb-1">Severity: {suggestion.severity}</p>
                    <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {suggestion.column !== '_all_' && (
                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded mr-2">
                    {suggestion.column}
                  </span>
                )}
                {suggestion.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor={`toggle-${suggestion.id}`} className="sr-only">
              Enable {suggestion.title}
            </Label>
            <Switch
              id={`toggle-${suggestion.id}`}
              checked={isEnabled}
              onCheckedChange={() => toggleSuggestion(suggestion.id)}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* Method selector */}
        {suggestion.uiConfig.renderAs === 'select' && suggestion.uiConfig.options && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Method</Label>
            <Select
              value={currentMethod}
              onValueChange={(value) => updateSuggestionMethod(suggestion.id, value)}
              disabled={!isEnabled}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {suggestion.uiConfig.options.map(option => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Impact indicator */}
        <div className="flex items-center justify-between pt-2 border-t text-xs">
          <span className="text-muted-foreground">Impact:</span>
          <span className={cn(
            'font-medium',
            isEnabled ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {suggestion.impact}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}





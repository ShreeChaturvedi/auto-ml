/**
 * PreprocessingPanel - Main preprocessing control panel
 * 
 * Features:
 * - Table selection from uploaded datasets
 * - Data quality overview
 * - AI-generated preprocessing suggestions as interactive cards
 * - "Express Lane" to apply all recommended settings
 */

import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Sparkles,
  Zap,
  RotateCcw,
  Database,
  AlertTriangle,
  CheckCircle2,
  Settings2
} from 'lucide-react';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { SuggestionCard } from './SuggestionCard';
import { DataQualityOverview } from './DataQualityOverview';
import type { Severity } from '@/types/preprocessing';

export function PreprocessingPanel() {
  const { projectId } = useParams<{ projectId: string }>();

  // Preprocessing store
  const {
    analysis,
    metadata,
    tables,
    selectedDatasetId,
    isLoadingTables,
    isAnalyzing,
    error,
    suggestionStates,
    loadTables,
    selectDataset,
    analyze,
    enableAllSuggestions,
    disableAllSuggestions,
    resetToDefaults
  } = usePreprocessingStore();

  // Get tables that correspond to uploaded datasets
  const availableTables = useMemo(() => tables, [tables]);

  // Load tables on mount
  useEffect(() => {
    if (projectId) {
      void loadTables(projectId);
    }
  }, [projectId, loadTables]);

  // Group suggestions by severity
  const groupedSuggestions = useMemo(() => {
    if (!analysis) return null;

    const groups: Record<Severity, typeof analysis.suggestions> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: []
    };

    for (const suggestion of analysis.suggestions) {
      groups[suggestion.severity].push(suggestion);
    }

    return groups;
  }, [analysis]);

  // Count enabled suggestions
  const enabledCount = useMemo(() => {
    return Object.values(suggestionStates).filter(s => s.enabled).length;
  }, [suggestionStates]);

  const totalCount = analysis?.suggestions.length ?? 0;

  // Handle table selection and auto-analyze
  const handleDatasetSelect = async (datasetId: string) => {
    selectDataset(datasetId);
    if (projectId) {
      await analyze(projectId, datasetId);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header - h-14 to align with sidebar */}
      <div className="flex h-14 items-center justify-between gap-4 px-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Data Preprocessing</span>
        </div>

        {/* Table selector */}
        <Select
          value={selectedDatasetId ?? ''}
          onValueChange={handleDatasetSelect}
          disabled={isLoadingTables || availableTables.length === 0}
        >
          <SelectTrigger className="w-[250px] h-9">
            <Database className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Select a dataset..." />
          </SelectTrigger>
          <SelectContent>
            {availableTables.map(table => (
              <SelectItem key={table.datasetId} value={table.datasetId}>
                <div className="flex items-center gap-2">
                  <span>{table.filename}</span>
                  {table.nRows ? (
                    <Badge variant="secondary" className="text-xs">
                      {table.nRows.toLocaleString()} rows
                    </Badge>
                  ) : null}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {isAnalyzing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <div>
              <p className="font-medium">Analyzing dataset...</p>
              <p className="text-sm text-muted-foreground">
                Detecting data quality issues and generating suggestions
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isAnalyzing && (
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="font-medium">Analysis Failed</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      selectedDatasetId && projectId && analyze(projectId, selectedDatasetId)
                    }
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state - no table selected */}
      {!selectedDatasetId && !isAnalyzing && !error && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-4 max-w-md">
            <div className="rounded-full bg-muted p-6 w-fit mx-auto">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Select a Dataset</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a dataset from the dropdown above to analyze it for preprocessing recommendations.
              </p>
            </div>
            {availableTables.length === 0 && !isLoadingTables && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                No datasets found. Upload a CSV or JSON file first.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Analysis results */}
      {analysis && !isAnalyzing && (
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Data Quality Overview */}
            <DataQualityOverview analysis={analysis} metadata={metadata ?? undefined} />

            <Separator />

            {/* Express Lane and controls */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Preprocessing Suggestions
                  <Badge variant="secondary">
                    {enabledCount} of {totalCount} enabled
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Toggle suggestions on/off and customize methods to prepare your data
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToDefaults}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disableAllSuggestions}
                >
                  Disable All
                </Button>
                <Button
                  size="sm"
                  onClick={enableAllSuggestions}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80"
                >
                  <Zap className="h-4 w-4" />
                  Express Lane
                </Button>
              </div>
            </div>

            {/* Suggestions grouped by severity */}
            {groupedSuggestions && (
              <div className="space-y-6">
                {/* Critical & High */}
                {(groupedSuggestions.critical.length > 0 || groupedSuggestions.high.length > 0) && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      High Priority Issues
                    </h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {[...groupedSuggestions.critical, ...groupedSuggestions.high].map(s => (
                        <SuggestionCard key={s.id} suggestion={s} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Medium */}
                {groupedSuggestions.medium.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-yellow-500" />
                      Recommended Improvements
                    </h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {groupedSuggestions.medium.map(s => (
                        <SuggestionCard key={s.id} suggestion={s} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Low & Info */}
                {(groupedSuggestions.low.length > 0 || groupedSuggestions.info.length > 0) && (
                  <details className="group">
                    <summary className="text-sm font-medium cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                      <span className="h-4 w-4 rounded border flex items-center justify-center text-xs group-open:rotate-90 transition-transform">
                        ▶
                      </span>
                      Optional Enhancements ({groupedSuggestions.low.length + groupedSuggestions.info.length})
                    </summary>
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {[...groupedSuggestions.low, ...groupedSuggestions.info].map(s => (
                        <SuggestionCard key={s.id} suggestion={s} />
                      ))}
                    </div>
                  </details>
                )}

                {/* No suggestions */}
                {totalCount === 0 && (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium">Data Looks Great!</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        No preprocessing issues detected. Your data is ready for feature engineering.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

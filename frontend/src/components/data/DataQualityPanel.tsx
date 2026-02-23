/**
 * DataQualityPanel - Overview of data quality metrics across all columns
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Hash, 
  Type, 
  Calendar,
  ToggleLeft,
  HelpCircle
} from 'lucide-react';
import type { DataQualitySummary } from '@/types/file';
import { cn } from '@/lib/utils';

interface DataQualityPanelProps {
  data: DataQualitySummary[];
  className?: string;
}

const dataTypeIcons: Record<DataQualitySummary['dataType'], typeof Hash> = {
  numeric: Hash,
  categorical: Type,
  datetime: Calendar,
  boolean: ToggleLeft,
  mixed: HelpCircle
};

const dataTypeColors: Record<DataQualitySummary['dataType'], string> = {
  numeric: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  categorical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  datetime: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  boolean: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  mixed: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
};

function getMissingStatus(percentage: number): { label: string; color: string; icon: typeof CheckCircle2 } {
  if (percentage === 0) {
    return { label: 'Complete', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 };
  }
  if (percentage < 5) {
    return { label: 'Low', color: 'text-yellow-600 dark:text-yellow-400', icon: AlertTriangle };
  }
  if (percentage < 20) {
    return { label: 'Moderate', color: 'text-orange-600 dark:text-orange-400', icon: AlertTriangle };
  }
  return { label: 'High', color: 'text-red-600 dark:text-red-400', icon: AlertTriangle };
}

export function DataQualityPanel({ data, className }: DataQualityPanelProps) {
  const summary = useMemo(() => {
    const totalColumns = data.length;
    const columnsWithMissing = data.filter(d => d.missingCount > 0).length;
    const avgMissingPct = data.length > 0 
      ? data.reduce((acc, d) => acc + d.missingPercentage, 0) / data.length 
      : 0;
    const completeColumns = data.filter(d => d.missingPercentage === 0).length;
    
    const typeDistribution = data.reduce((acc, d) => {
      acc[d.dataType] = (acc[d.dataType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalColumns,
      columnsWithMissing,
      avgMissingPct,
      completeColumns,
      typeDistribution
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No data quality information available.
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{summary.totalColumns}</div>
            <p className="text-xs text-muted-foreground">Total Columns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {summary.completeColumns}
            </div>
            <p className="text-xs text-muted-foreground">Complete Columns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {summary.columnsWithMissing}
            </div>
            <p className="text-xs text-muted-foreground">With Missing Values</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {summary.avgMissingPct.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Avg Missing Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Type Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Column Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.typeDistribution).map(([type, count]) => {
              const Icon = dataTypeIcons[type as DataQualitySummary['dataType']];
              return (
                <Badge 
                  key={type} 
                  variant="secondary"
                  className={cn('gap-1.5', dataTypeColors[type as DataQualitySummary['dataType']])}
                >
                  <Icon className="h-3 w-3" />
                  {type}: {count}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Column Details Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Column Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Missing</TableHead>
                  <TableHead className="w-[120px]">Completeness</TableHead>
                  <TableHead className="text-right">Unique</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((col) => {
                  const Icon = dataTypeIcons[col.dataType];
                  const status = getMissingStatus(col.missingPercentage);
                  const StatusIcon = status.icon;
                  const completeness = 100 - col.missingPercentage;

                  return (
                    <TableRow key={col.column}>
                      <TableCell className="font-medium max-w-[150px] truncate" title={col.column}>
                        {col.column}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary" 
                          className={cn('gap-1 text-xs', dataTypeColors[col.dataType])}
                        >
                          <Icon className="h-3 w-3" />
                          {col.dataType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {col.missingCount > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {col.missingCount.toLocaleString()} ({col.missingPercentage.toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={completeness} 
                            className="h-2"
                          />
                          <span className="text-xs font-mono w-10 text-right">
                            {completeness.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {col.uniqueCount.toLocaleString()}
                        <span className="text-muted-foreground ml-1">
                          ({col.uniquePercentage.toFixed(0)}%)
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className={cn('flex items-center gap-1 text-xs', status.color)}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          {status.label}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}





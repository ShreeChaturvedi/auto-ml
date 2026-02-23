/**
 * CategoricalChart - Bar chart visualization for categorical column distributions
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CategoricalColumnSummary } from '@/types/file';

interface CategoricalChartProps {
  data: CategoricalColumnSummary;
  className?: string;
}

// Color palette for bars
const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function CategoricalChart({ data, className }: CategoricalChartProps) {
  const chartData = useMemo(() => {
    return data.topValues.map((item, index) => ({
      name: item.value.length > 15 ? item.value.slice(0, 15) + '...' : item.value,
      fullName: item.value,
      count: item.count,
      percentage: item.percentage,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data.topValues]);

  const hasMoreValues = data.uniqueCount > data.topValues.length;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{data.column}</CardTitle>
            <CardDescription className="text-xs">
              {data.uniqueCount} unique value{data.uniqueCount !== 1 ? 's' : ''}
              {data.missingCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {' '}• {data.missingCount} missing
                </span>
              )}
            </CardDescription>
          </div>
          {data.mode && (
            <Badge variant="secondary" className="text-xs">
              Mode: {data.mode.length > 10 ? data.mode.slice(0, 10) + '...' : data.mode}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            No data available
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  horizontal={true}
                  vertical={false}
                  className="stroke-muted"
                />
                <XAxis 
                  type="number" 
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => value.toLocaleString()}
                  className="text-muted-foreground"
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={80}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
                        <p className="font-medium mb-1">{item.fullName}</p>
                        <p className="text-muted-foreground">
                          Count: <span className="font-mono">{item.count.toLocaleString()}</span>
                        </p>
                        <p className="text-muted-foreground">
                          Percentage: <span className="font-mono">{item.percentage.toFixed(1)}%</span>
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {hasMoreValues && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Showing top {data.topValues.length} of {data.uniqueCount} values
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface CategoricalSummaryGridProps {
  columns: CategoricalColumnSummary[];
}

export function CategoricalSummaryGrid({ columns }: CategoricalSummaryGridProps) {
  if (columns.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No categorical columns found in the data.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {columns.map((col) => (
        <CategoricalChart key={col.column} data={col} />
      ))}
    </div>
  );
}





import { ArrowUp, ArrowDown, ArrowLeftRight, Equal } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ParamComparisonTableProps {
  sourceParams: Record<string, unknown>;
  tunedParams: Record<string, unknown> | null;
}

function fmt(v: unknown): string {
  if (v == null) return '\u2014';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(6);
  if (typeof v === 'boolean') return String(v);
  return String(v);
}

function DeltaIcon({ source, tuned }: { source: unknown; tuned: unknown }) {
  if (typeof source === 'number' && typeof tuned === 'number') {
    if (tuned > source) return <ArrowUp className="h-3.5 w-3.5 text-emerald-500" />;
    if (tuned < source) return <ArrowDown className="h-3.5 w-3.5 text-red-500" />;
    return <Equal className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  if (source !== tuned) return <ArrowLeftRight className="h-3.5 w-3.5 text-amber-500" />;
  return <Equal className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function ParamComparisonTable({ sourceParams, tunedParams }: ParamComparisonTableProps) {
  if (!tunedParams || Object.keys(tunedParams).length === 0) return null;

  const keys = Object.keys(tunedParams);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parameter Comparison</p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs">Parameter</TableHead>
              <TableHead className="text-xs">Source</TableHead>
              <TableHead className="text-xs">Tuned</TableHead>
              <TableHead className="text-xs w-10">{'\u0394'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key}>
                <TableCell className="font-mono text-xs">{key}</TableCell>
                <TableCell className="font-mono tabular-nums text-xs text-muted-foreground">
                  {fmt(sourceParams[key])}
                </TableCell>
                <TableCell className="font-mono tabular-nums text-xs">
                  {fmt(tunedParams[key])}
                </TableCell>
                <TableCell>
                  <DeltaIcon source={sourceParams[key]} tuned={tunedParams[key]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

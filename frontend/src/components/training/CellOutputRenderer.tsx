/**
 * CellOutputRenderer - Renders rich outputs from Python execution
 * 
 * Supports text, tables, images, errors, and charts.
 */

import { cn } from '@/lib/utils';
import type { RichOutput } from '@/lib/api/execution';
import { AlertCircle, Table2, Image as ImageIcon } from 'lucide-react';

interface CellOutputRendererProps {
    outputs: RichOutput[];
    className?: string;
}

export function CellOutputRenderer({ outputs, className }: CellOutputRendererProps) {
    if (outputs.length === 0) return null;

    return (
        <div className={cn('space-y-2', className)}>
            {outputs.map((output, index) => (
                <OutputItem key={index} output={output} />
            ))}
        </div>
    );
}

function OutputItem({ output }: { output: RichOutput }) {
    switch (output.type) {
        case 'text':
            return (
                <pre className="whitespace-pre-wrap break-words">{output.content}</pre>
            );

        case 'error':
            return (
                <div className="font-mono text-xs">
                    <div className="flex items-center gap-1 text-red-500 mb-1">
                        <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        <span className="font-medium">Error</span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-red-400 pl-4 border-l-2 border-red-500/30">
                        {output.content}
                    </pre>
                </div>
            );

        case 'table':
            return <TableOutput output={output} />;

        case 'image':
            return (
                <div className="flex items-start gap-2">
                    <ImageIcon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <img
                        src={output.content}
                        alt="Output"
                        className="max-w-full rounded-md border"
                    />
                </div>
            );

        case 'html':
            return (
                <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: output.content }}
                />
            );

        default:
            return (
                <pre className="text-sm font-mono whitespace-pre-wrap bg-muted/50 p-2 rounded">
                    {output.content}
                </pre>
            );
    }
}

function TableOutput({ output }: { output: RichOutput }) {
    const data = output.data as { columns: string[]; rows: Record<string, unknown>[] } | undefined;

    if (!data?.columns || !data?.rows) {
        return (
            <div className="text-sm text-muted-foreground">
                {output.content}
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Table2 className="h-3.5 w-3.5" />
                {output.content}
            </div>
            <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            {data.columns.map((col, i) => (
                                <th
                                    key={i}
                                    className="px-3 py-2 text-left font-medium text-muted-foreground border-b"
                                >
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, i) => (
                            <tr key={i} className="border-b last:border-0">
                                {data.columns.map((col, j) => (
                                    <td key={j} className="px-3 py-2 font-mono text-xs">
                                        {formatValue(row[col])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? String(value) : value.toFixed(4);
    }
    if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
    }
    return String(value);
}

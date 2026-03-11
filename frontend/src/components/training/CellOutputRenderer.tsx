import type { RichOutput } from '@/lib/api/execution';
import { parseOutputRefUrl } from '@/lib/api/notebooks';
import { PlotlyOutput } from '@/components/notebook/PlotlyOutput';
import { ShadowHtml } from '@/components/notebook/ShadowHtml';
import { cn } from '@/lib/utils';
import { Table2 } from 'lucide-react';
import { formatValue, parseTableData, type TableData } from './cellOutputUtils';

interface CellOutputRendererProps {
    outputs: RichOutput[];
    className?: string;
}

export function CellOutputRenderer({ outputs, className }: CellOutputRendererProps) {
    if (outputs.length === 0) return null;

    return (
        <div className={cn('space-y-2 text-[12px] leading-5', className)}>
            {outputs.map((output, index) => (
                <OutputBody key={`${output.type}-${index}`} output={output} />
            ))}
        </div>
    );
}

function OutputBody({ output }: { output: RichOutput }) {
    switch (output.type) {
        case 'text':
        case 'error':
            return (
                <pre className={cn(
                    'whitespace-pre-wrap break-words font-mono text-[12px] leading-5',
                    output.type === 'error' && 'text-red-400'
                )}>
                    {output.content}
                </pre>
            );

        case 'table':
            return <TableOutput output={output} tableData={parseTableData(output.data)} />;

        case 'image': {
            const imageSrc = output.content.startsWith('outputs/')
                ? parseOutputRefUrl(output.content)
                : output.content;
            return (
                <img
                    src={imageSrc}
                    alt="Output"
                    loading="lazy"
                    decoding="async"
                    className="max-w-full rounded-md border object-contain"
                    onError={() => {
                        console.warn('[CellOutputRenderer] Failed to load image output:', { original: output.content, src: imageSrc });
                    }}
                    style={{ minHeight: 60, background: 'var(--muted)' }}
                />
            );
        }

        case 'html':
            return <ShadowHtml html={output.content} />;

        case 'chart':
            return <PlotlyOutput data={output.data} />;

        default:
            return (
                <pre className="whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-[12px] leading-5">
                    {output.content}
                </pre>
            );
    }
}

function TableOutput({ output, tableData }: { output: RichOutput; tableData: TableData | null }) {
    if (!tableData) {
        return <div className="text-[12px] text-muted-foreground">{output.content}</div>;
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Table2 className="h-3.5 w-3.5" />
                <span>{output.content}</span>
            </div>
            <div className="overflow-x-auto rounded-md border">
                <table className="min-w-full text-[12px]">
                    <thead className="bg-muted/50">
                        <tr>
                            {tableData.columns.map((column, index) => (
                                <th
                                    key={`${column}-${index}`}
                                    className="border-b px-3 py-1.5 text-left font-medium text-muted-foreground"
                                >
                                    {column}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-b last:border-0">
                                {tableData.columns.map((column, columnIndex) => (
                                    <td key={`${column}-${columnIndex}`} className="px-3 py-1.5 font-mono text-[11px]">
                                        {formatValue(row[column])}
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

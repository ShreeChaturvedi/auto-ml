import { useEffect, useMemo, useRef, useState } from 'react';
import type { RichOutput } from '@/lib/api/execution';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    AlertCircle,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    FileText,
    Image as ImageIcon,
    Table2
} from 'lucide-react';

interface CellOutputRendererProps {
    outputs: RichOutput[];
    className?: string;
}

interface TableData {
    columns: string[];
    rows: Record<string, unknown>[];
}

const COLLAPSE_LINE_THRESHOLD = 10;
const COLLAPSE_CHARACTER_THRESHOLD = 700;
const COLLAPSE_TABLE_ROW_THRESHOLD = 8;

export function CellOutputRenderer({ outputs, className }: CellOutputRendererProps) {
    if (outputs.length === 0) return null;

    return (
        <div className={cn('space-y-2 text-xs leading-5', className)}>
            {outputs.map((output, index) => (
                <OutputItem key={`${output.type}-${index}`} output={output} />
            ))}
        </div>
    );
}

function OutputItem({ output }: { output: RichOutput }) {
    const tableData = useMemo(() => parseTableData(output.data), [output.data]);
    const canCollapse = isCollapsibleOutput(output, tableData);
    const startsCollapsed = shouldStartCollapsed(output, tableData);
    const collapseSignature = `${output.type}:${output.content}:${tableData?.rows.length ?? 0}:${tableData?.columns.length ?? 0}`;
    const [isExpanded, setIsExpanded] = useState(() => !startsCollapsed);
    const [copied, setCopied] = useState(false);
    const resetCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (resetCopyTimeoutRef.current) {
                clearTimeout(resetCopyTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        setIsExpanded(!startsCollapsed);
    }, [collapseSignature, startsCollapsed]);

    const handleCopy = async () => {
        const copiedSuccessfully = await copyToClipboard(buildCopyText(output, tableData));

        if (!copiedSuccessfully) {
            return;
        }

        setCopied(true);
        if (resetCopyTimeoutRef.current) {
            clearTimeout(resetCopyTimeoutRef.current);
        }
        resetCopyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-md border bg-background/70">
            <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    {getOutputTypeIcon(output.type)}
                    <span>{getOutputTypeLabel(output.type)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        className="h-6 w-6"
                        onClick={handleCopy}
                        title="Copy output"
                        aria-label="Copy output"
                    >
                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                    </Button>

                    {canCollapse && (
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            className="h-6 w-6"
                            onClick={() => setIsExpanded((previous) => !previous)}
                            title={isExpanded ? 'Collapse output' : 'Expand output'}
                            aria-label={isExpanded ? 'Collapse output' : 'Expand output'}
                        >
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                    )}
                </div>
            </div>

            {isExpanded ? (
                <div className="px-2.5 py-2">
                    <OutputBody output={output} tableData={tableData} />
                </div>
            ) : (
                <div className="px-2.5 py-2 text-[11px] text-muted-foreground">
                    {getCollapsedSummary(output, tableData)}
                </div>
            )}
        </div>
    );
}

function OutputBody({ output, tableData }: { output: RichOutput; tableData: TableData | null }) {
    switch (output.type) {
        case 'text':
            return <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5">{output.content}</pre>;

        case 'error':
            return (
                <div className="space-y-1">
                    <div className="flex items-center gap-1 text-[11px] text-red-500">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-semibold">Error</span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words border-l-2 border-red-500/30 pl-3 font-mono text-[12px] leading-5 text-red-400">
                        {output.content}
                    </pre>
                </div>
            );

        case 'table':
            return <TableOutput output={output} tableData={tableData} />;

        case 'image':
            return (
                <div className="space-y-1">
                    <img
                        src={output.content}
                        alt="Output"
                        className="max-h-[360px] max-w-full rounded-md border object-contain"
                    />
                    <p className="text-[11px] text-muted-foreground">Rendered image output</p>
                </div>
            );

        case 'html':
            return (
                <div
                    className="prose prose-sm max-w-none text-[13px] leading-relaxed dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: output.content }}
                />
            );

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

function parseTableData(rawData: unknown): TableData | null {
    if (!rawData || typeof rawData !== 'object') {
        return null;
    }

    const data = rawData as { columns?: unknown; rows?: unknown };
    if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) {
        return null;
    }

    if (!data.columns.every((column) => typeof column === 'string')) {
        return null;
    }

    if (!data.rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
        return null;
    }

    return {
        columns: data.columns,
        rows: data.rows as Record<string, unknown>[]
    };
}

function isCollapsibleOutput(output: RichOutput, tableData: TableData | null): boolean {
    if (output.type === 'table') {
        return Boolean(tableData) && tableData.rows.length > 0;
    }

    if (output.type === 'image') {
        return true;
    }

    return output.content.length > 0;
}

function shouldStartCollapsed(output: RichOutput, tableData: TableData | null): boolean {
    if (output.type === 'table') {
        return Boolean(tableData) && tableData.rows.length > COLLAPSE_TABLE_ROW_THRESHOLD;
    }

    if (output.type === 'image') {
        return false;
    }

    return (
        output.content.length > COLLAPSE_CHARACTER_THRESHOLD ||
        getLineCount(output.content) > COLLAPSE_LINE_THRESHOLD
    );
}

function getCollapsedSummary(output: RichOutput, tableData: TableData | null): string {
    if (output.type === 'table' && tableData) {
        return `${tableData.rows.length} rows x ${tableData.columns.length} columns`;
    }

    if (output.type === 'image') {
        return 'Image output hidden';
    }

    const firstLine = output.content
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0);

    if (!firstLine) {
        return 'Output hidden';
    }

    return firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine;
}

function getOutputTypeLabel(type: RichOutput['type']): string {
    switch (type) {
        case 'error':
            return 'Error';
        case 'table':
            return 'Table';
        case 'image':
            return 'Image';
        case 'html':
            return 'HTML';
        case 'chart':
            return 'Chart';
        default:
            return 'Output';
    }
}

function getOutputTypeIcon(type: RichOutput['type']) {
    switch (type) {
        case 'error':
            return <AlertCircle className="h-3.5 w-3.5" />;
        case 'table':
            return <Table2 className="h-3.5 w-3.5" />;
        case 'image':
            return <ImageIcon className="h-3.5 w-3.5" />;
        default:
            return <FileText className="h-3.5 w-3.5" />;
    }
}

function buildCopyText(output: RichOutput, tableData: TableData | null): string {
    if (output.type !== 'table' || !tableData) {
        return output.content;
    }

    const header = tableData.columns.join('\t');
    const body = tableData.rows
        .map((row) => tableData.columns.map((column) => formatValue(row[column])).join('\t'))
        .join('\n');

    return `${header}\n${body}`;
}

async function copyToClipboard(value: string): Promise<boolean> {
    if (!value) {
        return false;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch (error) {
            void error;
        }
    }

    if (typeof document === 'undefined') {
        return false;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);

    return copied;
}

function getLineCount(content: string): number {
    if (!content) {
        return 0;
    }
    return content.split('\n').length;
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

import type { RichOutput } from '@/lib/api/execution';

export interface TableData {
    columns: string[];
    rows: Record<string, unknown>[];
}

export function buildOutputCopyText(outputs: RichOutput[]): string {
    return outputs
        .map((output) => buildSingleOutputCopyText(output))
        .filter((segment) => segment.length > 0)
        .join('\n');
}

export function parseTableData(rawData: unknown): TableData | null {
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

export function formatValue(value: unknown): string {
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

function buildSingleOutputCopyText(output: RichOutput): string {
    const tableData = parseTableData(output.data);

    if (output.type !== 'table' || !tableData) {
        return output.content;
    }

    const header = tableData.columns.join('\t');
    const body = tableData.rows
        .map((row) => tableData.columns.map((column) => formatValue(row[column])).join('\t'))
        .join('\n');

    return body ? `${header}\n${body}` : header;
}

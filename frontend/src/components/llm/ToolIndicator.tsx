/**
 * ToolIndicator - Enhanced tool call indicators with ThinkingBlock-like styling
 *
 * Features:
 * - Proper tense: "Reading..." while running, "Read" when done
 * - Same visual style as ThinkingBlock (clickable rows, expandable content)
 * - Spinner replaces icon during loading
 * - Metallic shine animation on loading tools
 * - Expandable dropdowns with typed, human-friendly renderers via ToolResultRenderer
 * - No chevron - click anywhere on row to toggle
 * - Result count badge shown inline for data-returning tools
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import { ToolResultRenderer, EXPANDABLE_TOOLS } from '@/components/llm/ToolResultRenderer';
import {
    Globe,
    Eye,
    FolderOpen,
    Loader2,
    AlertCircle,
    FileCode,
    List,
    FileEdit,
    Play,
    SquareCode,
    Pencil,
    Package,
    Trash2,
    ArrowUpDown,
    Plus
} from 'lucide-react';

interface ToolIndicatorProps {
    toolCalls: ToolCall[];
    results: ToolResult[];
    isRunning: boolean;
}

type ToolStatus = 'pending' | 'running' | 'done' | 'error';

interface ToolDisplay {
    call: ToolCall;
    status: ToolStatus;
    result?: ToolResult;
    label: string;
    hasDropdown: boolean;
}

// Get the static icon for a tool (shown when done/pending)
function getToolIcon(tool: ToolCall['tool'], status: ToolStatus) {
    const iconClass = cn(
        'h-4 w-4 flex-shrink-0',
        status === 'done' && 'text-emerald-600',
        status === 'error' && 'text-destructive',
        (status === 'pending' || status === 'running') && 'text-muted-foreground'
    );

    switch (tool) {
        case 'search_documents':
            return <Globe className={iconClass} />;
        case 'list_project_files':
            return <FolderOpen className={iconClass} />;
        case 'get_dataset_profile':
        case 'get_dataset_sample':
            return <Eye className={iconClass} />;
        case 'list_cells':
            return <List className={iconClass} />;
        case 'read_cell':
            return <FileCode className={iconClass} />;
        case 'write_cell':
            return <SquareCode className={iconClass} />;
        case 'edit_cell':
            return <Pencil className={iconClass} />;
        case 'run_cell':
            return <Play className={iconClass} />;
        case 'install_package':
        case 'uninstall_package':
        case 'list_packages':
            return <Package className={iconClass} />;
        case 'delete_cell':
            return <Trash2 className={iconClass} />;
        case 'reorder_cells':
            return <ArrowUpDown className={iconClass} />;
        case 'insert_cell':
            return <Plus className={iconClass} />;
        default:
            return <FileEdit className={iconClass} />;
    }
}

// Get proper tense labels
function getToolLabel(call: ToolCall, status: ToolStatus): string {
    const args = call.args ?? {};
    const isDone = status === 'done' || status === 'error';

    switch (call.tool) {
        case 'search_documents': {
            const query = typeof args.query === 'string' ? args.query : 'documents';
            const truncatedQuery = query.length > 30 ? `${query.slice(0, 30)}…` : query;
            return isDone ? `Searched "${truncatedQuery}"` : `Searching "${truncatedQuery}"`;
        }
        case 'list_project_files':
            return isDone ? 'Explored workspace' : 'Exploring workspace';
        case 'get_dataset_profile':
            return isDone ? 'Read dataset profile' : 'Reading dataset profile';
        case 'get_dataset_sample':
            return isDone ? 'Read dataset sample' : 'Reading dataset sample';
        case 'list_cells':
            return isDone ? 'Listed cells' : 'Listing cells';
        case 'read_cell':
            return isDone ? 'Read cell' : 'Reading cell';
        case 'write_cell':
            return isDone ? 'Wrote cell' : 'Writing cell';
        case 'edit_cell': {
            const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
            const endLine = typeof args.endLine === 'number' ? args.endLine : startLine;
            if (startLine == null) {
                return isDone ? 'Edited cell' : 'Editing cell';
            }
            if (endLine == null || endLine === startLine) {
                return isDone ? `Edited line ${startLine}` : `Editing line ${startLine}`;
            }
            return isDone ? `Edited lines ${startLine}–${endLine}` : `Editing lines ${startLine}–${endLine}`;
        }
        case 'run_cell':
            return isDone ? 'Ran cell' : 'Running cell';
        case 'install_package': {
            const pkg = typeof args.packageName === 'string' ? args.packageName : 'package';
            return isDone ? `Installed ${pkg}` : `Installing ${pkg}`;
        }
        case 'uninstall_package': {
            const pkg = typeof args.packageName === 'string' ? args.packageName : 'package';
            return isDone ? `Uninstalled ${pkg}` : `Uninstalling ${pkg}`;
        }
        case 'list_packages':
            return isDone ? 'Listed packages' : 'Listing packages';
        case 'delete_cell':
            return isDone ? 'Deleted cell' : 'Deleting cell';
        case 'reorder_cells':
            return isDone ? 'Reordered cells' : 'Reordering cells';
        case 'insert_cell':
            return isDone ? 'Inserted cell' : 'Inserting cell';
        default:
            return call.tool;
    }
}

/** Produce a tiny inline count hint for the result (e.g. "3 results") */
function getResultHint(call: ToolCall, result?: ToolResult): string | null {
    if (!result?.output || result.error) return null;
    const out = result.output;

    switch (call.tool) {
        case 'search_documents': {
            const items = Array.isArray(out)
                ? out
                : Array.isArray((out as { items?: unknown }).items)
                    ? (out as { items: unknown[] }).items
                    : null;
            if (items) return `${items.length} hit${items.length !== 1 ? 's' : ''}`;
            return null;
        }
        case 'get_dataset_profile': {
            const cols = (out as { nCols?: number }).nCols;
            const rows = (out as { nRows?: number }).nRows;
            if (cols != null && rows != null) return `${rows.toLocaleString()}×${cols}`;
            return null;
        }
        case 'get_dataset_sample': {
            const sample = (out as { sample?: unknown[] }).sample;
            if (Array.isArray(sample)) return `${sample.length} row${sample.length !== 1 ? 's' : ''}`;
            return null;
        }
        case 'list_project_files': {
            const ds = (out as { datasets?: unknown[] }).datasets?.length ?? 0;
            const docs = (out as { documents?: unknown[] }).documents?.length ?? 0;
            return `${ds + docs} file${ds + docs !== 1 ? 's' : ''}`;
        }
        case 'list_cells': {
            const cells = (out as { cells?: unknown[] }).cells;
            if (Array.isArray(cells)) return `${cells.length} cell${cells.length !== 1 ? 's' : ''}`;
            return null;
        }
        default:
            return null;
    }
}

// Single tool row component
function ToolRow({ display }: { display: ToolDisplay }) {
    const [expanded, setExpanded] = useState(false);
    const { call, status, result, label, hasDropdown } = display;

    const isLoading = status === 'running';
    const showDropdown = hasDropdown && status === 'done' && result && !result.error;
    const hint = getResultHint(call, result);

    return (
        <div className="flex flex-col">
            <button
                type="button"
                onClick={() => showDropdown && setExpanded(!expanded)}
                disabled={!showDropdown}
                className={cn(
                    'flex items-center gap-2 text-sm transition-all',
                    'py-1.5 px-2.5 rounded-md w-full text-left',
                    showDropdown && 'hover:bg-muted/50 cursor-pointer',
                    !showDropdown && 'cursor-default',
                    status === 'error' && 'text-destructive',
                    status === 'done' && 'text-muted-foreground',
                    isLoading && 'text-muted-foreground'
                )}
            >
                {/* Icon or spinner */}
                {isLoading ? (
                    <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-muted-foreground" />
                ) : status === 'error' ? (
                    <AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
                ) : (
                    getToolIcon(call.tool, status)
                )}

                {/* Label with shimmer effect when loading */}
                <span className={cn('flex-1', isLoading && 'shimmer-text')}>
                    {label}
                </span>

                {/* Inline result count hint */}
                {hint && status === 'done' && (
                    <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums flex-shrink-0">
                        {hint}
                    </span>
                )}

                {/* Error message inline */}
                {status === 'error' && result?.error && (
                    <span className="text-[10px] text-destructive/70 truncate max-w-[150px]">
                        {result.error}
                    </span>
                )}
            </button>

            {/* Expandable content — rendered by ToolResultRenderer */}
            {expanded && showDropdown && (
                <div className="ml-6 mt-1 p-3 bg-muted/30 rounded-md border border-muted/50 max-h-[300px] overflow-y-auto">
                    <ToolResultRenderer call={call} result={result} />
                </div>
            )}
        </div>
    );
}

export function ToolIndicator({ toolCalls, results, isRunning }: ToolIndicatorProps) {
    const displayItems = useMemo<ToolDisplay[]>(() => {
        return toolCalls.map((call) => {
            const result = results.find((r) => r.id === call.id);
            let status: ToolStatus = 'pending';

            if (result) {
                status = result.error ? 'error' : 'done';
            } else if (isRunning) {
                status = 'running';
            }

            return {
                call,
                status,
                result,
                label: getToolLabel(call, status),
                hasDropdown: EXPANDABLE_TOOLS.has(call.tool)
            };
        });
    }, [toolCalls, results, isRunning]);

    if (displayItems.length === 0) return null;

    return (
        <div className="space-y-0.5">
            {displayItems.map((display) => (
                <ToolRow key={display.call.id} display={display} />
            ))}
        </div>
    );
}

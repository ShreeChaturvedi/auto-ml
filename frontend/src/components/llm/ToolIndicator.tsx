/**
 * ToolIndicator - Enhanced tool call indicators with ThinkingBlock-like styling
 *
 * Features:
 * - Proper tense: "Reading..." while running, "Read" when done
 * - Same visual style as ThinkingBlock (clickable rows, expandable content)
 * - Spinner replaces icon during loading
 * - Metallic shine animation on loading tools
 * - Expandable dropdowns for edit_cell (diffs) and search_documents (results)
 * - No chevron - click anywhere on row to toggle
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ToolCall, ToolResult } from '@/types/llmUi';
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
    Pencil
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
            const startLine = typeof args.startLine === 'number' ? args.startLine : '?';
            const endLine = typeof args.endLine === 'number' ? args.endLine : '?';
            return isDone ? `Edited lines ${startLine}–${endLine}` : `Editing lines ${startLine}–${endLine}`;
        }
        case 'run_cell':
            return isDone ? 'Ran cell' : 'Running cell';
        default:
            return call.tool;
    }
}

// Check if tool has expandable content
function hasExpandableContent(tool: ToolCall['tool']): boolean {
    return ['edit_cell', 'search_documents'].includes(tool);
}

// Render dropdown content for a tool
function ToolDropdownContent({ call, result }: { call: ToolCall; result?: ToolResult }) {
    if (!result) return null;

    if (call.tool === 'edit_cell') {
        const output = result.output as { oldContent?: string; newContent?: string } | undefined;
        if (!output?.oldContent && !output?.newContent) {
            return <span className="text-muted-foreground italic">No changes recorded</span>;
        }

        // Render git-style diff
        const oldLines = (output.oldContent || '').split('\n');
        const newLines = (output.newContent || '').split('\n');

        return (
            <div className="font-mono text-xs space-y-0.5">
                {oldLines.map((line, i) => (
                    <div key={`old-${i}`} className="text-red-500 bg-red-500/10 px-2 py-0.5 rounded-sm">
                        - {line}
                    </div>
                ))}
                {newLines.map((line, i) => (
                    <div key={`new-${i}`} className="text-green-500 bg-green-500/10 px-2 py-0.5 rounded-sm">
                        + {line}
                    </div>
                ))}
            </div>
        );
    }

    if (call.tool === 'search_documents') {
        const output = result.output;
        if (!output) {
            return <span className="text-muted-foreground italic">No results</span>;
        }

        // Handle array of search results
        if (Array.isArray(output)) {
            return (
                <div className="space-y-2">
                    {output.slice(0, 5).map((item, i) => (
                        <div key={i} className="text-xs">
                            {typeof item === 'object' && item !== null ? (
                                <div className="space-y-1">
                                    {(item as { title?: string }).title && (
                                        <div className="font-medium">{(item as { title?: string }).title}</div>
                                    )}
                                    {(item as { snippet?: string }).snippet && (
                                        <div className="text-muted-foreground">{(item as { snippet?: string }).snippet}</div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-muted-foreground">{String(item)}</div>
                            )}
                        </div>
                    ))}
                </div>
            );
        }

        // Handle object or string
        return (
            <pre className="text-xs whitespace-pre-wrap text-muted-foreground">
                {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
            </pre>
        );
    }

    return null;
}

// Single tool row component
function ToolRow({ display }: { display: ToolDisplay }) {
    const [expanded, setExpanded] = useState(false);
    const { call, status, result, label, hasDropdown } = display;

    const isLoading = status === 'running';
    const showDropdown = hasDropdown && status === 'done' && result && !result.error;

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

                {/* Error message inline */}
                {status === 'error' && result?.error && (
                    <span className="text-[10px] text-destructive/70 truncate max-w-[150px]">
                        {result.error}
                    </span>
                )}
            </button>

            {/* Expandable content */}
            {expanded && showDropdown && (
                <div className="ml-6 mt-1 p-3 bg-muted/30 rounded-md border border-muted/50 max-h-[200px] overflow-y-auto">
                    <ToolDropdownContent call={call} result={result} />
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
                hasDropdown: hasExpandableContent(call.tool)
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

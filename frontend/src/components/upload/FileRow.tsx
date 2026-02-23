/**
 * FileRow - Simple file display row without card borders
 *
 * Features:
 * - Minimal row layout (icon, name, metadata, actions)
 * - No card borders or heavy styling
 * - Hover actions (preview, delete)
 * - Status indicators for upload state
 */

import { useState } from 'react';
import { Trash2, Eye, Loader2, Check, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { UploadedFile } from '@/types/file';
import { getFileIcon, formatFileSize } from '@/types/file';
import { FilePreview } from './FilePreview';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileRowProps {
  file: UploadedFile;
  onRemove: (fileId: string) => void;
  status?: 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
}

export function FileRow({ file, onRemove, status, errorMessage }: FileRowProps) {
  const [showPreview, setShowPreview] = useState(false);

  const iconName = getFileIcon(file.type);
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    iconName
  ];

  const typeColorMap: Record<typeof file.type, string> = {
    csv: 'text-green-500',
    json: 'text-blue-500',
    excel: 'text-emerald-500',
    pdf: 'text-red-500',
    markdown: 'text-cyan-500',
    word: 'text-indigo-500',
    text: 'text-slate-500',
    other: 'text-gray-500'
  };

  // Truncate file name if longer than 35 characters
  const shouldTruncate = file.name.length > 35;
  const displayName = shouldTruncate ? `${file.name.slice(0, 32)}...` : file.name;

  return (
    <>
      <div className="group flex items-center gap-3 py-2 px-1 rounded-md hover:bg-accent/30 transition-colors">
        {/* Icon */}
        <div className={cn('flex-shrink-0', typeColorMap[file.type])}>
          {IconComponent && <IconComponent className="h-5 w-5" />}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          {/* File Name */}
          {shouldTruncate ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-sm font-medium text-foreground truncate cursor-help">
                    {displayName}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-sm">
                  <p className="text-xs break-all">{file.name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <p className="text-sm font-medium text-foreground truncate">
              {displayName}
            </p>
          )}

          {/* Metadata row */}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground uppercase font-medium">
              {file.type}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatFileSize(file.size)}
            </span>
            {file.metadata?.tableName && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">
                  {file.metadata.tableName}
                </span>
              </>
            )}
            {typeof file.metadata?.chunkCount === 'number' && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">
                  {file.metadata.chunkCount} chunks
                </span>
              </>
            )}
          </div>

          {/* Error message */}
          {status === 'error' && errorMessage && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errorMessage}
            </p>
          )}
          {file.metadata?.parseWarning && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {file.metadata.parseWarning}
            </p>
          )}
        </div>

        {/* Status indicator */}
        <div className="flex-shrink-0">
          {status === 'uploading' && (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          )}
          {status === 'uploaded' && (
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/40 gap-1">
              <Check className="h-3 w-3" />
              Synced
            </Badge>
          )}
          {status === 'error' && (
            <Badge variant="destructive" className="text-xs">
              Failed
            </Badge>
          )}
        </div>

        {/* Actions - Show on hover */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={() => setShowPreview(true)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="sr-only">Preview file</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Preview</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRemove(file.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">Delete file</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Delete</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Preview Dialog */}
      <FilePreview file={file} open={showPreview} onOpenChange={setShowPreview} />
    </>
  );
}

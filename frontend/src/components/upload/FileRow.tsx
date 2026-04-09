import { useState } from 'react';
import { Trash2, Eye, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { UploadedFile } from '@/types/file';
import { resolveFileIcon, formatFileSize } from '@/lib/fileUtils';
import { FilePreview } from './FilePreview';
import { cn } from '@/lib/utils';

interface FileRowProps {
  file: UploadedFile;
  onRemove: (fileId: string) => void;
  status?: 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (fileId: string) => void;
  selectionActive?: boolean;
}

export function FileRow({
  file,
  onRemove,
  status,
  errorMessage,
  selectable = false,
  selected = false,
  onToggleSelect,
  selectionActive = false,
}: FileRowProps) {
  const [showPreview, setShowPreview] = useState(false);

  const { Icon, colorClass } = resolveFileIcon(file.type);
  const isUploading = status === 'uploading';
  const isError = status === 'error';
  const showCheckbox = selectable && selectionActive;

  const handleRowClick = (e: React.MouseEvent) => {
    if (!selectable) return;
    // Don't toggle if user is selecting text
    if (window.getSelection()?.toString()) return;
    // Don't toggle if clicking an interactive element inside the row
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [role="dialog"]')) return;
    onToggleSelect?.(file.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectable) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onToggleSelect?.(file.id);
    }
  };

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-3 py-1.5 px-1 rounded-md border-b border-border/50 transition-colors',
          selectable && 'cursor-pointer hover:bg-muted/50',
          !selectable && !selectionActive && 'hover:bg-muted/50',
          selected && 'bg-muted/60',
          selectionActive && !selectable && 'opacity-60',
        )}
        onClick={handleRowClick}
        onKeyDown={handleKeyDown}
        tabIndex={selectable ? 0 : undefined}
        role={selectable ? 'option' : undefined}
        aria-selected={selectable ? selected : undefined}
      >
        {/* Icon / Checkbox / Spinner / Error — crossfade container */}
        <div className={cn('relative flex-shrink-0 h-5 w-5', colorClass)}>
          <Icon
            className={cn(
              'h-5 w-5 absolute inset-0 transition-opacity duration-200',
              (isUploading || isError || showCheckbox) && 'opacity-0 pointer-events-none',
              selectable && !selectionActive && !isUploading && !isError
                && 'group-hover:opacity-0 group-hover:pointer-events-none',
            )}
          />

          {selectable && (
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center transition-opacity duration-200 pointer-events-none',
                showCheckbox ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              <Checkbox
                checked={selected}
                className="h-[18px] w-[18px] rounded-full pointer-events-none"
                tabIndex={-1}
                aria-hidden
              />
            </div>
          )}

          {/* Spinner — visible while uploading */}
          <Loader2
            className={cn(
              'h-5 w-5 absolute inset-0 text-muted-foreground transition-opacity duration-300',
              isUploading ? 'animate-spin-slow opacity-100' : 'opacity-0 pointer-events-none',
            )}
          />
          {/* Error icon */}
          {isError && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="h-5 w-5 absolute inset-0 text-destructive" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">{errorMessage ?? 'Upload failed'}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Filename */}
        <p
          title={file.name}
          className={cn(
            'flex-1 min-w-0 text-sm font-medium text-foreground truncate',
            isUploading && 'shimmer-text',
          )}
        >
          {file.name}
        </p>

        {/* File size / Actions — actions overlay size on hover */}
        <div className="relative flex-shrink-0 flex items-center justify-end">
          <span className={cn(
            'text-xs text-muted-foreground font-mono transition-opacity',
            !selectionActive && 'group-hover:opacity-0 group-focus-within:opacity-0',
          )}>
            {formatFileSize(file.size)}
          </span>

          {/* Per-row actions — hidden when selection is active */}
          {!selectionActive && (
            <div className="absolute inset-y-0 right-0 flex items-center gap-1 pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 transition-opacity">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPreview(true);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="sr-only">Preview file</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Preview</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(file.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete file</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Delete</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <FilePreview file={file} open={showPreview} onOpenChange={setShowPreview} />
    </>
  );
}
